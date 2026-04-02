import json
import os
import uuid
import tempfile
import threading
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify

bp = Blueprint("experiments", __name__, url_prefix="/api/experiments")

def _resolve_hf_org() -> str:
    """Resolve HF org from env > .raca/config.yaml > fallback."""
    org = os.environ.get("HF_ORG")
    if org and org != "your-org":
        return org
    # Walk up from this file looking for .raca/config.yaml
    from pathlib import Path
    current = Path(__file__).resolve().parent
    for _ in range(10):
        current = current.parent
        config = current / ".raca" / "config.yaml"
        if config.exists():
            try:
                import yaml
                with open(config) as f:
                    cfg = yaml.safe_load(f) or {}
                org = cfg.get("hf_org", "")
                if org:
                    return org
            except Exception:
                pass
    return "your-org"

HF_ORG = _resolve_hf_org()
DASHBOARD_REPO = f"{HF_ORG}/RESEARCH_DASHBOARD"
LOCAL_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

_cache: dict[str, list[dict]] = {}
_cache_loaded: set[str] = set()
_dashboard_cache: dict[str, dict] = {}
_dashboard_cache_loaded: bool = False
_lock = threading.Lock()

FILES = ["experiments", "runs", "sub_experiments", "experiment_notes", "summary_findings", "activity_logs", "artifacts"]


def _ensure_local_dir():
    os.makedirs(LOCAL_DATA_DIR, exist_ok=True)


def _local_path(name: str) -> str:
    _ensure_local_dir()
    return os.path.join(LOCAL_DATA_DIR, f"{name}.json")


def _download_file(name: str) -> list[dict]:
    try:
        from huggingface_hub import hf_hub_download
        path = hf_hub_download(
            DASHBOARD_REPO,
            f"{name}.json",
            repo_type="dataset",
        )
        with open(path) as f:
            data = json.load(f)
        with open(_local_path(name), "w") as f:
            json.dump(data, f, indent=2)
        return data
    except Exception:
        local = _local_path(name)
        if os.path.exists(local):
            with open(local) as f:
                return json.load(f)
        return []


def _upload_file(name: str, data: list[dict]):
    with open(_local_path(name), "w") as f:
        json.dump(data, f, indent=2)

    def _do_upload():
        try:
            from huggingface_hub import HfApi
            api = HfApi()
            try:
                api.create_repo(DASHBOARD_REPO, repo_type="dataset", exist_ok=True)
            except Exception:
                pass
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
                json.dump(data, f, indent=2)
                tmp = f.name
            api.upload_file(
                path_or_fileobj=tmp,
                path_in_repo=f"{name}.json",
                repo_id=DASHBOARD_REPO,
                repo_type="dataset",
            )
            os.unlink(tmp)
        except Exception as e:
            print(f"[experiments] HF upload failed for {name}: {e}")

    threading.Thread(target=_do_upload, daemon=True).start()


def _get(name: str):
    """Get cached data, downloading from HF if needed.
    Returns list[dict] for most files, but dict for activity_logs (keyed by experiment_id).
    """
    # Check cache without holding lock during download
    with _lock:
        if name in _cache_loaded:
            data = _cache.get(name, [])
            return dict(data) if isinstance(data, dict) else list(data)
        need_download = True

    if need_download:
        # Download outside the lock so one slow download doesn't block all requests
        downloaded = _download_file(name)
        with _lock:
            if name not in _cache_loaded:  # Double-check after reacquiring
                _cache[name] = downloaded
                _cache_loaded.add(name)
            data = _cache.get(name, [])
            return dict(data) if isinstance(data, dict) else list(data)


def _set(name: str, data: list[dict]):
    with _lock:
        _cache[name] = data
        _cache_loaded.add(name)
    _upload_file(name, data)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_dashboard_state() -> dict:
    """Load dashboard_state.json (a single dict, not an array) from HF or local fallback."""
    global _dashboard_cache_loaded
    with _lock:
        if _dashboard_cache_loaded:
            return dict(_dashboard_cache)
    try:
        from huggingface_hub import hf_hub_download
        path = hf_hub_download(
            DASHBOARD_REPO,
            "dashboard_state.json",
            repo_type="dataset",
        )
        with open(path) as f:
            data = json.load(f)
        # Cache locally
        local = os.path.join(LOCAL_DATA_DIR, "dashboard_state.json")
        _ensure_local_dir()
        with open(local, "w") as f:
            json.dump(data, f, indent=2)
        with _lock:
            _dashboard_cache.clear()
            _dashboard_cache.update(data if isinstance(data, dict) else {})
            _dashboard_cache_loaded = True
        return dict(_dashboard_cache)
    except Exception:
        local = os.path.join(LOCAL_DATA_DIR, "dashboard_state.json")
        if os.path.exists(local):
            try:
                with open(local) as f:
                    data = json.load(f)
                with _lock:
                    _dashboard_cache.clear()
                    _dashboard_cache.update(data if isinstance(data, dict) else {})
                    _dashboard_cache_loaded = True
                return dict(_dashboard_cache)
            except Exception:
                pass
        with _lock:
            _dashboard_cache_loaded = True
        return {}


def _merge_dashboard_state(experiments: list[dict]) -> list[dict]:
    """Enrich experiment list with live dashboard state fields."""
    state = _load_dashboard_state()
    if not state:
        return experiments

    # Build lookup: dashboard state keyed by experiment id and name
    exp_states: dict[str, dict] = {}
    for exp_id, exp_state in state.items():
        if isinstance(exp_state, dict):
            exp_states[exp_id] = exp_state
            # Also index by name if present
            name = exp_state.get("name", "")
            if name:
                exp_states[name] = exp_state

    # Enrich existing experiments
    seen_ids = set()
    result = []
    for exp in experiments:
        seen_ids.add(exp["id"])
        ds = exp_states.get(exp["id"]) or exp_states.get(exp.get("name", ""))
        if ds:
            exp = {
                **exp,
                "live_status": ds.get("status"),
                "live_message": ds.get("message", ""),
                "live_jobs": ds.get("jobs", {}),
                "unreachable_clusters": ds.get("unreachable_clusters", {}),
                "live_history": ds.get("history", []),
                "live_started_at": ds.get("started_at"),
                "live_updated_at": ds.get("updated_at"),
            }
        result.append(exp)

    # Add experiments that exist ONLY in dashboard state (not in experiments.json)
    for exp_id, ds in state.items():
        if exp_id not in seen_ids and isinstance(ds, dict):
            seen_ids.add(exp_id)
            result.append({
                "id": exp_id,
                "name": ds.get("name", exp_id),
                "research_project": ds.get("research_project", ""),
                "hypothesis": {
                    "statement": "",
                    "type": "exploration",
                    "status": "pending",
                    "success_criteria": "",
                },
                "stage": "active",
                "completeness": 0,
                "models": [],
                "tasks": [],
                "tags": [],
                "hf_repos": [],
                "wandb_url": "",
                "notes": "",
                "created": ds.get("started_at", _now()),
                "updated": ds.get("updated_at", _now()),
                "run_count": 0,
                "sub_count": 0,
                "note_count": 0,
                "live_status": ds.get("status"),
                "live_message": ds.get("message", ""),
                "live_jobs": ds.get("jobs", {}),
                "unreachable_clusters": ds.get("unreachable_clusters", {}),
                "live_history": ds.get("history", []),
                "live_started_at": ds.get("started_at"),
                "live_updated_at": ds.get("updated_at"),
            })

    return result


# --- Experiments CRUD ---

@bp.route("/", methods=["GET"])
def list_experiments():
    experiments = _get("experiments")
    runs = _get("runs")
    subs = _get("sub_experiments")
    notes = _get("experiment_notes")

    # Enrich with counts
    result = []
    for exp in experiments:
        exp_runs = [r for r in runs if r.get("experiment_id") == exp["id"]]
        exp_subs = [s for s in subs if s.get("experiment_id") == exp["id"]]
        exp_notes = [n for n in notes if n.get("experiment_id") == exp["id"]]
        result.append({
            **exp,
            "run_count": len(exp_runs),
            "sub_count": len(exp_subs),
            "note_count": len(exp_notes),
        })

    # Merge live dashboard state
    result = _merge_dashboard_state(result)

    return jsonify(result)


@bp.route("/", methods=["POST"])
def create_experiment():
    data = request.get_json()
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    exp_id = data.get("id", name.lower().replace(" ", "_"))

    experiments = _get("experiments")
    if any(e["id"] == exp_id for e in experiments):
        return jsonify({"error": f"Experiment '{exp_id}' already exists"}), 409

    experiment = {
        "id": exp_id,
        "name": name,
        "research_project": data.get("research_project", ""),
        "hypothesis": data.get("hypothesis", {
            "statement": "",
            "type": "exploration",
            "status": "pending",
            "success_criteria": "",
        }),
        "stage": data.get("stage", "idea"),
        "completeness": data.get("completeness", 0),
        "models": data.get("models", []),
        "tasks": data.get("tasks", []),
        "tags": data.get("tags", []),
        "hf_repos": data.get("hf_repos", []),
        "wandb_url": data.get("wandb_url", ""),
        "notes": data.get("notes", ""),
        "created": _now(),
        "updated": _now(),
    }

    experiments.append(experiment)
    _set("experiments", experiments)
    return jsonify(experiment), 201


@bp.route("/<exp_id>", methods=["GET"])
def get_experiment(exp_id):
    experiments = _get("experiments")
    exp = next((e for e in experiments if e["id"] == exp_id), None)
    if not exp:
        return jsonify({"error": "not found"}), 404

    runs = [r for r in _get("runs") if r.get("experiment_id") == exp_id]
    subs = [s for s in _get("sub_experiments") if s.get("experiment_id") == exp_id]
    notes = [n for n in _get("experiment_notes") if n.get("experiment_id") == exp_id]

    # Activity log
    all_logs = _get("activity_logs")
    if isinstance(all_logs, dict):
        activity_log = all_logs.get(exp_id, [])
    elif isinstance(all_logs, list) and len(all_logs) == 1 and isinstance(all_logs[0], dict):
        activity_log = all_logs[0].get(exp_id, [])
    else:
        activity_log = []

    # Artifacts from manifest
    all_artifacts = _get("artifacts")
    artifacts = [a for a in all_artifacts if a.get("experiment_id") == exp_id]

    return jsonify({
        **exp,
        "runs": runs,
        "sub_experiments": subs,
        "experiment_notes": notes,
        "activity_log": activity_log,
        "artifacts": artifacts,
    })


@bp.route("/<exp_id>", methods=["PUT"])
def update_experiment(exp_id):
    data = request.get_json()
    experiments = _get("experiments")

    for exp in experiments:
        if exp["id"] == exp_id:
            for key in ["name", "research_project", "hypothesis", "stage",
                        "completeness", "models", "tasks", "tags", "hf_repos",
                        "wandb_url", "notes"]:
                if key in data:
                    exp[key] = data[key]
            exp["updated"] = _now()
            _set("experiments", experiments)
            return jsonify(exp)

    return jsonify({"error": "not found"}), 404


@bp.route("/<exp_id>", methods=["DELETE"])
def delete_experiment(exp_id):
    experiments = _get("experiments")
    experiments = [e for e in experiments if e["id"] != exp_id]
    _set("experiments", experiments)

    # Also delete associated runs, subs, and notes
    runs = [r for r in _get("runs") if r.get("experiment_id") != exp_id]
    _set("runs", runs)
    subs = [s for s in _get("sub_experiments") if s.get("experiment_id") != exp_id]
    _set("sub_experiments", subs)
    notes = [n for n in _get("experiment_notes") if n.get("experiment_id") != exp_id]
    _set("experiment_notes", notes)

    return jsonify({"status": "ok"})


# --- Run records ---

@bp.route("/<exp_id>/runs", methods=["POST"])
def create_run(exp_id):
    experiments = _get("experiments")
    if not any(e["id"] == exp_id for e in experiments):
        return jsonify({"error": "experiment not found"}), 404

    data = request.get_json()
    run = {
        "id": data.get("id", f"run_{uuid.uuid4().hex[:8]}"),
        "experiment_id": exp_id,
        "condition": data.get("condition", ""),
        "model": data.get("model", ""),
        "cluster": data.get("cluster", ""),
        "status": data.get("status", "completed"),
        "hf_dataset": data.get("hf_dataset", ""),
        "metrics": data.get("metrics", {}),
        "timestamp": data.get("timestamp", _now()),
        "notes": data.get("notes", ""),
    }

    runs = _get("runs")
    runs.append(run)
    _set("runs", runs)

    # Touch experiment updated timestamp
    for exp in experiments:
        if exp["id"] == exp_id:
            exp["updated"] = _now()
    _set("experiments", experiments)

    return jsonify(run), 201


@bp.route("/<exp_id>/runs/<run_id>", methods=["PUT"])
def update_run(exp_id, run_id):
    data = request.get_json()
    runs = _get("runs")

    for run in runs:
        if run["id"] == run_id and run["experiment_id"] == exp_id:
            for key in ["condition", "model", "cluster", "status",
                        "hf_dataset", "metrics", "notes"]:
                if key in data:
                    run[key] = data[key]
            _set("runs", runs)
            return jsonify(run)

    return jsonify({"error": "not found"}), 404


@bp.route("/<exp_id>/runs/<run_id>", methods=["DELETE"])
def delete_run(exp_id, run_id):
    runs = _get("runs")
    runs = [r for r in runs if not (r["id"] == run_id and r["experiment_id"] == exp_id)]
    _set("runs", runs)
    return jsonify({"status": "ok"})


# --- Sub-experiments ---

@bp.route("/<exp_id>/subs", methods=["POST"])
def create_sub(exp_id):
    experiments = _get("experiments")
    if not any(e["id"] == exp_id for e in experiments):
        return jsonify({"error": "experiment not found"}), 404

    data = request.get_json()
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    sub_id = data.get("id", f"{exp_id}__{name.lower().replace(' ', '_')}")

    sub = {
        "id": sub_id,
        "experiment_id": exp_id,
        "name": name,
        "hypothesis": data.get("hypothesis", ""),
        "status": data.get("status", "active"),
        "content_md": data.get("content_md", ""),
        "hf_repos": data.get("hf_repos", []),
        "created": _now(),
        "updated": _now(),
    }

    subs = _get("sub_experiments")
    subs.append(sub)
    _set("sub_experiments", subs)

    # Touch experiment updated timestamp
    for exp in experiments:
        if exp["id"] == exp_id:
            exp["updated"] = _now()
    _set("experiments", experiments)

    return jsonify(sub), 201


@bp.route("/<exp_id>/subs/<sub_id>", methods=["PUT"])
def update_sub(exp_id, sub_id):
    data = request.get_json()
    subs = _get("sub_experiments")

    for sub in subs:
        if sub["id"] == sub_id and sub["experiment_id"] == exp_id:
            for key in ["name", "hypothesis", "status", "content_md", "hf_repos"]:
                if key in data:
                    sub[key] = data[key]
            sub["updated"] = _now()
            _set("sub_experiments", subs)
            return jsonify(sub)

    return jsonify({"error": "not found"}), 404


@bp.route("/<exp_id>/subs/<sub_id>", methods=["DELETE"])
def delete_sub(exp_id, sub_id):
    subs = _get("sub_experiments")
    subs = [s for s in subs if not (s["id"] == sub_id and s["experiment_id"] == exp_id)]
    _set("sub_experiments", subs)
    return jsonify({"status": "ok"})


# --- Experiment Notes ---

@bp.route("/<exp_id>/notes", methods=["POST"])
def create_note(exp_id):
    experiments = _get("experiments")
    if not any(e["id"] == exp_id for e in experiments):
        return jsonify({"error": "experiment not found"}), 404

    data = request.get_json()
    title = data.get("title", "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400

    note_id = data.get("id", f"{exp_id}__note_{uuid.uuid4().hex[:8]}")

    note = {
        "id": note_id,
        "experiment_id": exp_id,
        "title": title,
        "filename": data.get("filename", ""),
        "content_md": data.get("content_md", ""),
        "created": _now(),
        "updated": _now(),
    }

    notes = _get("experiment_notes")
    notes.append(note)
    _set("experiment_notes", notes)
    return jsonify(note), 201


@bp.route("/<exp_id>/notes/<note_id>", methods=["GET"])
def get_note(exp_id, note_id):
    notes = _get("experiment_notes")
    note = next((n for n in notes if n["id"] == note_id and n["experiment_id"] == exp_id), None)
    if not note:
        return jsonify({"error": "not found"}), 404
    return jsonify(note)


@bp.route("/<exp_id>/notes/<note_id>", methods=["PUT"])
def update_note(exp_id, note_id):
    data = request.get_json()
    notes = _get("experiment_notes")

    for note in notes:
        if note["id"] == note_id and note["experiment_id"] == exp_id:
            for key in ["title", "content_md"]:
                if key in data:
                    note[key] = data[key]
            note["updated"] = _now()
            _set("experiment_notes", notes)
            return jsonify(note)

    return jsonify({"error": "not found"}), 404


@bp.route("/<exp_id>/notes/<note_id>", methods=["DELETE"])
def delete_note(exp_id, note_id):
    notes = _get("experiment_notes")
    notes = [n for n in notes if not (n["id"] == note_id and n["experiment_id"] == exp_id)]
    _set("experiment_notes", notes)
    return jsonify({"status": "ok"})


# --- Activity Log ---

@bp.route("/<exp_id>/activity-log", methods=["GET"])
def get_activity_log(exp_id):
    """Get activity log entries for an experiment."""
    all_logs = _get("activity_logs")
    # activity_logs is a dict keyed by experiment_id (or empty list on first load)
    if isinstance(all_logs, dict):
        entries = all_logs.get(exp_id, [])
    elif isinstance(all_logs, list) and len(all_logs) == 1 and isinstance(all_logs[0], dict):
        # HF download may wrap dict in a list
        entries = all_logs[0].get(exp_id, [])
    else:
        entries = []

    # Sort by timestamp descending (most recent first)
    entries.sort(key=lambda e: e.get("timestamp", ""), reverse=True)

    # Optional filters
    scope = request.args.get("scope")
    entry_type = request.args.get("type")
    if scope:
        entries = [e for e in entries if e.get("scope") == scope]
    if entry_type:
        entries = [e for e in entries if e.get("type") == entry_type]

    return jsonify(entries)


# --- Artifacts ---

@bp.route("/<exp_id>/artifacts", methods=["GET"])
def get_artifacts(exp_id):
    """Get artifact entries for an experiment from manifest data."""
    all_artifacts = _get("artifacts")
    artifacts = [a for a in all_artifacts if a.get("experiment_id") == exp_id]
    return jsonify(artifacts)


# --- Summary Findings ---

@bp.route("/summary", methods=["GET"])
def get_summary():
    data = _get("summary_findings")
    if data and len(data) > 0:
        return jsonify(data[0])
    return jsonify({"content_md": "", "updated": ""})


# --- Sync & Import ---

@bp.route("/sync", methods=["POST"])
def sync():
    global _dashboard_cache_loaded
    with _lock:
        _cache.clear()
        _cache_loaded.clear()
        _dashboard_cache.clear()
        _dashboard_cache_loaded = False
    for name in FILES:
        _get(name)
    return jsonify({"status": "ok"})


@bp.route("/import", methods=["POST"])
def import_experiments():
    """Bulk import from experiment.yaml format (as produced by exp-runner)."""
    data = request.get_json()
    items = data if isinstance(data, list) else [data]
    imported = []

    experiments = _get("experiments")
    runs = _get("runs")
    subs = _get("sub_experiments")
    existing_ids = {e["id"] for e in experiments}

    for item in items:
        exp_id = item.get("name", "").lower().replace(" ", "_").replace("-", "_")
        if not exp_id:
            continue

        hypothesis = item.get("hypothesis", {})
        models = item.get("models", [])
        model_names = [m.get("id", "") if isinstance(m, dict) else str(m) for m in models]

        if exp_id not in existing_ids:
            experiment = {
                "id": exp_id,
                "name": item.get("name", exp_id),
                "research_project": item.get("research_project", ""),
                "hypothesis": {
                    "statement": hypothesis.get("statement", "") if isinstance(hypothesis, dict) else str(hypothesis),
                    "type": hypothesis.get("type", "exploration") if isinstance(hypothesis, dict) else "exploration",
                    "status": hypothesis.get("status", "pending") if isinstance(hypothesis, dict) else "pending",
                    "success_criteria": hypothesis.get("success_criteria", "") if isinstance(hypothesis, dict) else "",
                },
                "stage": "active",
                "completeness": 0,
                "models": model_names,
                "tasks": [],
                "tags": item.get("observability", {}).get("tags", []) if isinstance(item.get("observability"), dict) else [],
                "hf_repos": [],
                "wandb_url": "",
                "notes": "",
                "created": item.get("created", _now()),
                "updated": _now(),
            }
            experiments.append(experiment)
            existing_ids.add(exp_id)

        # Import runs
        for run_data in item.get("runs", []):
            run_id = run_data.get("run_id", f"run_{uuid.uuid4().hex[:8]}")
            if any(r["id"] == run_id and r["experiment_id"] == exp_id for r in runs):
                continue
            run = {
                "id": run_id,
                "experiment_id": exp_id,
                "condition": run_data.get("condition", ""),
                "model": run_data.get("model", ""),
                "cluster": run_data.get("cluster", ""),
                "status": run_data.get("status", "completed"),
                "hf_dataset": run_data.get("hf_dataset", ""),
                "metrics": run_data.get("metrics", {}),
                "timestamp": run_data.get("timestamp", _now()),
                "notes": run_data.get("notes", ""),
            }
            runs.append(run)

            # Add HF repo to experiment if present
            if run.get("hf_dataset"):
                for exp in experiments:
                    if exp["id"] == exp_id:
                        existing_repos = {r["repo"] for r in exp.get("hf_repos", [])}
                        if run["hf_dataset"] not in existing_repos:
                            exp.setdefault("hf_repos", []).append({
                                "repo": run["hf_dataset"],
                                "description": f"{run['condition']} - {run['model']}",
                                "date": run["timestamp"][:10] if run["timestamp"] else "",
                            })

        imported.append(exp_id)

    _set("experiments", experiments)
    _set("runs", runs)
    _set("sub_experiments", subs)

    return jsonify({"imported": imported, "count": len(imported)})
