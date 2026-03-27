import json
import os
import uuid
import tempfile
import threading
from flask import Blueprint, request, jsonify

bp = Blueprint("presets", __name__, url_prefix="/api/presets")

HF_ORG = os.environ.get("HF_ORG", "your-org")
PRESETS_REPO = f"{HF_ORG}/AGG_VIS_PRESETS"
VALID_TYPES = {"model"}
LOCAL_PRESETS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "presets")

# In-memory cache: vis_type -> list[dict]
_cache: dict[str, list[dict]] = {}
_cache_loaded: set[str] = set()
_lock = threading.Lock()


def _ensure_local_dir():
    os.makedirs(LOCAL_PRESETS_DIR, exist_ok=True)


def _local_path(vis_type: str) -> str:
    _ensure_local_dir()
    return os.path.join(LOCAL_PRESETS_DIR, f"{vis_type}_presets.json")


def _download_presets(vis_type: str) -> list[dict]:
    """Download presets from HuggingFace, falling back to local file."""
    try:
        from huggingface_hub import hf_hub_download
        path = hf_hub_download(
            PRESETS_REPO,
            f"{vis_type}_presets.json",
            repo_type="dataset",
        )
        with open(path) as f:
            presets = json.load(f)
        # Cache locally for offline fallback
        with open(_local_path(vis_type), "w") as f:
            json.dump(presets, f, indent=2)
        return presets
    except Exception:
        # Fall back to local cache
        local = _local_path(vis_type)
        if os.path.exists(local):
            with open(local) as f:
                return json.load(f)
        return []


def _upload_presets(vis_type: str, presets: list[dict]):
    """Upload presets to HuggingFace (best-effort, non-blocking)."""
    # Always save locally first
    with open(_local_path(vis_type), "w") as f:
        json.dump(presets, f, indent=2)

    def _do_upload():
        try:
            from huggingface_hub import HfApi
            api = HfApi()
            # Ensure repo exists
            try:
                api.create_repo(
                    PRESETS_REPO,
                    repo_type="dataset",
                    exist_ok=True,
                )
            except Exception:
                pass
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
                json.dump(presets, f, indent=2)
                tmp = f.name
            api.upload_file(
                path_or_fileobj=tmp,
                path_in_repo=f"{vis_type}_presets.json",
                repo_id=PRESETS_REPO,
                repo_type="dataset",
            )
            os.unlink(tmp)
        except Exception as e:
            print(f"[presets] HF upload failed for {vis_type}: {e}")

    threading.Thread(target=_do_upload, daemon=True).start()


def _get_presets(vis_type: str) -> list[dict]:
    """Get presets for a visualizer type, downloading if needed."""
    with _lock:
        if vis_type not in _cache_loaded:
            _cache[vis_type] = _download_presets(vis_type)
            _cache_loaded.add(vis_type)
        return list(_cache.get(vis_type, []))


def _set_presets(vis_type: str, presets: list[dict]):
    """Update presets in cache and sync to HF."""
    with _lock:
        _cache[vis_type] = presets
        _cache_loaded.add(vis_type)
    _upload_presets(vis_type, presets)


@bp.route("/<vis_type>", methods=["GET"])
def list_presets(vis_type):
    if vis_type not in VALID_TYPES:
        return jsonify({"error": f"Invalid type. Must be one of: {VALID_TYPES}"}), 400
    return jsonify(_get_presets(vis_type))


@bp.route("/<vis_type>", methods=["POST"])
def create_preset(vis_type):
    if vis_type not in VALID_TYPES:
        return jsonify({"error": f"Invalid type. Must be one of: {VALID_TYPES}"}), 400

    data = request.get_json()
    name = data.get("name", "").strip()

    if not name:
        return jsonify({"error": "name is required"}), 400

    preset = {
        "id": uuid.uuid4().hex[:8],
        "name": name,
    }
    # Include type-specific fields
    repo = data.get("repo", "").strip()
    if not repo:
        return jsonify({"error": "repo is required"}), 400
    preset["repo"] = repo
    preset["split"] = data.get("split", "train")

    if vis_type == "model":
        preset["column"] = data.get("column", "model_responses")
    elif vis_type in ("rlm", "rlm-eval"):
        preset["config"] = data.get("config", "rlm_call_traces")

    presets = _get_presets(vis_type)
    presets.append(preset)
    _set_presets(vis_type, presets)

    return jsonify(preset), 201


@bp.route("/<vis_type>/<preset_id>", methods=["PUT"])
def update_preset(vis_type, preset_id):
    if vis_type not in VALID_TYPES:
        return jsonify({"error": f"Invalid type. Must be one of: {VALID_TYPES}"}), 400

    data = request.get_json()
    presets = _get_presets(vis_type)

    for p in presets:
        if p["id"] == preset_id:
            if "name" in data:
                p["name"] = data["name"].strip()
            if "column" in data:
                p["column"] = data["column"]
            if "split" in data:
                p["split"] = data["split"]
            if "config" in data:
                p["config"] = data["config"]
            _set_presets(vis_type, presets)
            return jsonify(p)

    return jsonify({"error": "not found"}), 404


@bp.route("/<vis_type>/<preset_id>", methods=["DELETE"])
def delete_preset(vis_type, preset_id):
    if vis_type not in VALID_TYPES:
        return jsonify({"error": f"Invalid type. Must be one of: {VALID_TYPES}"}), 400

    presets = _get_presets(vis_type)
    presets = [p for p in presets if p["id"] != preset_id]
    _set_presets(vis_type, presets)
    return jsonify({"status": "ok"})


@bp.route("/sync", methods=["POST"])
def sync_presets():
    """Force re-download presets from HF."""
    with _lock:
        _cache.clear()
        _cache_loaded.clear()
    for vt in VALID_TYPES:
        _get_presets(vt)
    return jsonify({"status": "ok"})
