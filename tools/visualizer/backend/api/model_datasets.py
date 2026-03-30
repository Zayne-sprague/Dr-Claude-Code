import json
import os
import hashlib
from flask import Blueprint, request, jsonify
from datasets import load_dataset, Dataset

bp = Blueprint("model_datasets", __name__, url_prefix="/api/model/datasets")

# In-memory cache: id -> {dataset, repo, column, split, n_rows, n_samples}
_cache: dict[str, dict] = {}


def _make_id(repo: str, column: str, split: str) -> str:
    key = f"{repo}:{column}:{split}"
    return hashlib.md5(key.encode()).hexdigest()[:12]


def _load_hf_dataset(repo: str, split: str) -> Dataset:
    if os.path.exists(repo):
        return Dataset.from_parquet(repo)
    return load_dataset(repo, split=split)


def _detect_response_column(columns: list[str], preferred: str) -> str:
    if preferred and preferred in columns:
        return preferred
    for fallback in ["model_responses", "model_response", "response", "responses", "output", "outputs", "completion", "messages"]:
        if fallback in columns:
            return fallback
    # Last resort: return preferred if set, otherwise first column
    return preferred if preferred else (columns[0] if columns else "")


def _detect_prompt_column(columns: list[str], preferred: str) -> str | None:
    if preferred and preferred in columns:
        return preferred
    for fallback in ["formatted_prompt", "prompt", "question", "input", "instruction"]:
        if fallback in columns:
            return fallback
    return None


def _compute_question_fingerprint(ds: Dataset, n: int = 5) -> str:
    """Hash first N question texts to fingerprint the question set."""
    questions = []
    for i in range(min(n, len(ds))):
        row = ds[i]
        for qcol in ["question", "prompt", "input", "formatted_prompt"]:
            if qcol in row:
                questions.append(str(row[qcol] or "")[:200])
                break
    return hashlib.md5("||".join(questions).encode()).hexdigest()[:8]


def _compute_chat_fingerprint(ds: Dataset, column: str, n: int = 5) -> str:
    """Hash first N user messages from chat-format data to fingerprint the question set."""
    prompts = []
    for i in range(min(n, len(ds))):
        row = ds[i]
        messages = row[column]
        if _is_chat_messages(messages):
            _, user_prompt, _ = _extract_chat_messages(messages)
            prompts.append(user_prompt[:200])
        else:
            prompts.append("")
    return hashlib.md5("||".join(prompts).encode()).hexdigest()[:8]


def _count_samples(ds: Dataset, column: str) -> int:
    if len(ds) == 0:
        return 0
    first = ds[0][column]
    if isinstance(first, list):
        return len(first)
    return 1


def _flatten_evals(evals) -> list[bool]:
    if not isinstance(evals, list):
        return [bool(evals)]
    return [
        bool(e[-1]) if isinstance(e, list) and len(e) > 0
        else (bool(e) if not isinstance(e, list) else False)
        for e in evals
    ]


def _is_chat_messages(value) -> bool:
    """Check if a column value is in chat format (list of role/content dicts)."""
    if not isinstance(value, list) or len(value) == 0:
        return False
    first = value[0]
    return isinstance(first, dict) and "role" in first and "content" in first


def _extract_chat_messages(messages: list[dict]) -> tuple[str, str, str]:
    """Extract (system, user_prompt, assistant_response) from chat messages."""
    system = ""
    user_prompt = ""
    assistant_response = ""
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "") or ""
        if role == "system":
            system = content
        elif role == "user":
            user_prompt = content
        elif role == "assistant":
            assistant_response = content
    return system, user_prompt, assistant_response


def _extract_reasoning(meta: dict | None) -> str | None:
    """Extract reasoning/thinking content from response metadata's raw_response."""
    if not meta or not isinstance(meta, dict):
        return None
    raw = meta.get("raw_response")
    if not raw or not isinstance(raw, dict):
        return None
    try:
        msg = raw["choices"][0]["message"]
        return (
            msg.get("reasoning_content")
            or msg.get("thinking")
            or msg.get("reasoning")
        )
    except (KeyError, IndexError, TypeError):
        return None


def _merge_reasoning_into_response(response: str, reasoning: str | None) -> str:
    """Prepend <think>{reasoning}</think> to response if reasoning exists
    and isn't already present in the response."""
    if not reasoning:
        return response or ""
    response = response or ""
    # Don't double-add if response already contains the thinking
    if "<think>" in response:
        return response
    return f"<think>{reasoning}</think>\n{response}"


def _analyze_trace(text: str) -> dict:
    if not text:
        return dict(total_len=0, think_len=0, answer_len=0,
                    backtracks=0, restarts=0, think_text="", answer_text="")
    think_end = text.find("</think>")
    if think_end > 0:
        # Keep raw tags so display is 1:1 with HuggingFace data
        think_text = text[:think_end + 8]  # include </think>
        answer_text = text[think_end + 8:].strip()
    else:
        think_text = text
        answer_text = ""
    t = text.lower()
    backtracks = sum(t.count(w) for w in
                     ["wait,", "wait ", "hmm", "let me try", "try again",
                      "another approach", "let me reconsider"])
    restarts = sum(t.count(w) for w in
                   ["start over", "fresh approach", "different approach", "from scratch"])
    return dict(total_len=len(text), think_len=len(think_text),
                answer_len=len(answer_text), backtracks=backtracks,
                restarts=restarts, think_text=think_text, answer_text=answer_text)


@bp.route("/load", methods=["POST"])
def load_dataset_endpoint():
    data = request.get_json()
    repo = data.get("repo", "").strip()
    if not repo:
        return jsonify({"error": "repo is required"}), 400

    split = data.get("split", "train")
    preferred_column = data.get("column") or ""
    preferred_prompt_column = data.get("prompt_column") or ""

    try:
        ds = _load_hf_dataset(repo, split)
    except Exception as e:
        return jsonify({"error": f"Failed to load dataset: {e}"}), 400

    columns = ds.column_names
    column = _detect_response_column(columns, preferred_column)
    prompt_column = _detect_prompt_column(columns, preferred_prompt_column)

    if column not in columns:
        return jsonify({
            "error": f"Column '{column}' not found. Available: {columns}"
        }), 400

    # Detect chat messages format (list of role/content dicts)
    is_chat = False
    if len(ds) > 0 and column in ds.column_names:
        first_val = ds[0][column]
        is_chat = _is_chat_messages(first_val)

    n_samples = 1 if is_chat else _count_samples(ds, column)
    ds_id = _make_id(repo, column, split)

    if is_chat:
        # For chat format, fingerprint based on the user message content
        fingerprint = _compute_chat_fingerprint(ds, column)
    else:
        fingerprint = _compute_question_fingerprint(ds)

    _cache[ds_id] = {
        "dataset": ds,
        "repo": repo,
        "column": column,
        "prompt_column": prompt_column,
        "split": split,
        "n_rows": len(ds),
        "n_samples": n_samples,
        "question_fingerprint": fingerprint,
        "is_chat": is_chat,
    }

    short_name = repo.rsplit("/", 1)[-1] if "/" in repo else repo

    return jsonify({
        "id": ds_id,
        "repo": repo,
        "name": short_name,
        "column": column,
        "prompt_column": prompt_column,
        "columns": columns,
        "split": split,
        "n_rows": len(ds),
        "n_samples": n_samples,
        "question_fingerprint": fingerprint,
    })


@bp.route("/", methods=["GET"])
def list_datasets():
    result = []
    for ds_id, info in _cache.items():
        result.append({
            "id": ds_id,
            "repo": info["repo"],
            "name": info["repo"].rsplit("/", 1)[-1] if "/" in info["repo"] else info["repo"],
            "column": info["column"],
            "split": info["split"],
            "n_rows": info["n_rows"],
            "n_samples": info["n_samples"],
            "question_fingerprint": info.get("question_fingerprint", ""),
        })
    return jsonify(result)


@bp.route("/<ds_id>/question/<int:idx>", methods=["GET"])
def get_question(ds_id, idx):
    if ds_id not in _cache:
        return jsonify({"error": "Dataset not loaded"}), 404

    info = _cache[ds_id]
    ds = info["dataset"]
    column = info["column"]

    if idx < 0 or idx >= len(ds):
        return jsonify({"error": f"Index {idx} out of range (0-{len(ds)-1})"}), 400

    row = ds[idx]
    is_chat = info.get("is_chat", False)

    if is_chat:
        # Chat messages format: extract assistant response, user prompt, system
        messages = row[column]
        system_msg, user_prompt, assistant_response = _extract_chat_messages(messages)
        responses_raw = [assistant_response]
        prompt_text = user_prompt
        question = user_prompt
    else:
        responses_raw = row[column]
        if not isinstance(responses_raw, list):
            responses_raw = [responses_raw]

        # Check for {column}__metadata to recover reasoning/thinking content
        meta_column = f"{column}__metadata"
        response_metas = None
        if meta_column in row:
            response_metas = row[meta_column]
            if not isinstance(response_metas, list):
                response_metas = [response_metas]

        # Merge reasoning from metadata into responses
        merged_responses = []
        for i, resp in enumerate(responses_raw):
            meta = response_metas[i] if response_metas and i < len(response_metas) else None
            reasoning = _extract_reasoning(meta)
            merged_responses.append(_merge_reasoning_into_response(resp, reasoning))
        responses_raw = merged_responses

        # Prompt text from configured prompt column
        prompt_text = ""
        prompt_col = info.get("prompt_column")
        if prompt_col and prompt_col in row:
            val = row[prompt_col]
            if isinstance(val, str):
                prompt_text = val
            elif isinstance(val, list):
                prompt_text = json.dumps(val)
            elif val is not None:
                prompt_text = str(val)

        question = ""
        for qcol in ["question", "prompt", "input", "problem", "formatted_prompt"]:
            if qcol in row:
                val = row[qcol] or ""
                if isinstance(val, str):
                    question = val
                elif isinstance(val, list):
                    question = json.dumps(val)
                else:
                    question = str(val)
                break

    eval_correct = []
    if "eval_correct" in row:
        eval_correct = _flatten_evals(row["eval_correct"])
    elif "correct" in row:
        eval_correct = _flatten_evals(row["correct"])

    # Check extractions with column-aware name
    extractions = []
    extractions_col = f"{column}__extractions"
    for ecol in [extractions_col, "response__extractions"]:
        if ecol in row:
            ext = row[ecol]
            if isinstance(ext, list):
                extractions = [str(e) for e in ext]
            break

    metadata = {}
    if "metadata" in row:
        metadata = row["metadata"] if isinstance(row["metadata"], dict) else {}

    analyses = [_analyze_trace(r or "") for r in responses_raw]

    return jsonify({
        "question": question,
        "prompt_text": prompt_text,
        "responses": [r or "" for r in responses_raw],
        "eval_correct": eval_correct,
        "extractions": extractions,
        "metadata": metadata,
        "analyses": analyses,
        "n_samples": len(responses_raw),
        "index": idx,
    })


@bp.route("/<ds_id>/summary", methods=["GET"])
def get_summary(ds_id):
    if ds_id not in _cache:
        return jsonify({"error": "Dataset not loaded"}), 404

    info = _cache[ds_id]
    ds = info["dataset"]
    n_rows = info["n_rows"]
    n_samples = info["n_samples"]

    # Support both "eval_correct" and "correct" column names
    eval_col = None
    if "eval_correct" in ds.column_names:
        eval_col = "eval_correct"
    elif "correct" in ds.column_names:
        eval_col = "correct"

    if eval_col is None:
        return jsonify({
            "n_rows": n_rows,
            "n_samples": n_samples,
            "has_eval": False,
        })

    pass_at = {}
    for k in [1, 2, 4, 8]:
        if k > n_samples:
            break
        correct = sum(1 for i in range(n_rows)
                      if any(_flatten_evals(ds[i][eval_col])[:k]))
        pass_at[k] = {"correct": correct, "total": n_rows,
                       "rate": correct / n_rows if n_rows > 0 else 0}

    total_samples = n_rows * n_samples
    total_correct = sum(
        sum(_flatten_evals(ds[i][eval_col]))
        for i in range(n_rows)
    )

    return jsonify({
        "n_rows": n_rows,
        "n_samples": n_samples,
        "has_eval": True,
        "sample_accuracy": {
            "correct": total_correct,
            "total": total_samples,
            "rate": total_correct / total_samples if total_samples > 0 else 0,
        },
        "pass_at": pass_at,
    })


@bp.route("/<ds_id>", methods=["DELETE"])
def unload_dataset(ds_id):
    if ds_id in _cache:
        del _cache[ds_id]
    return jsonify({"status": "ok"})
