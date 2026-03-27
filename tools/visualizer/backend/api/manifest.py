"""Shared manifest query API — loads PROJECT-MANIFEST from HuggingFace.

Provides both a utility function (for use by other blueprints) and a
shared /api/manifest endpoint so any frontend tab can browse runs.
"""

import json
import logging
import os

from datasets import load_dataset
from flask import Blueprint, jsonify, request
from huggingface_hub import HfApi

ORG_NAME = os.environ.get("HF_ORG", "your-org")
MANIFEST_REPO = f"{ORG_NAME}/PROJECT-MANIFEST"

log = logging.getLogger(__name__)

bp = Blueprint("manifest", __name__, url_prefix="/api/manifest")


def get_manifest():
    """Load PROJECT-MANIFEST dataset. Returns list of dicts, or None on failure."""
    try:
        ds = load_dataset(MANIFEST_REPO, split="train")
        return [row for row in ds]
    except Exception as e:
        error_str = str(e).lower()
        if any(phrase in error_str for phrase in [
            "doesn't exist", "404", "no data", "corresponds to no data",
        ]):
            return None
        raise


def _get_live_repos() -> set[str]:
    """Return set of dataset repo IDs that actually exist in the org."""
    try:
        api = HfApi()
        return {
            ds.id for ds in api.list_datasets(author=ORG_NAME)
        }
    except Exception as e:
        log.warning("Failed to list org datasets for liveness check: %s", e)
        return set()


def query_runs(prefix: str, validate: bool = True):
    """Query manifest for datasets matching a name prefix. Returns list of run dicts.

    Args:
        prefix: filter by dataset_name prefix (empty string = all).
        validate: if True, filter out datasets that no longer exist on HF.
    """
    manifest = get_manifest()
    if manifest is None:
        return []

    live_repos = _get_live_repos() if validate else set()

    runs = []
    for row in manifest:
        name = row.get("dataset_name", "")
        if prefix and not name.startswith(prefix):
            continue
        repo = f"{ORG_NAME}/{name}"
        if validate and live_repos and repo not in live_repos:
            continue
        tags = row.get("tags", [])
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except (json.JSONDecodeError, TypeError):
                tags = []
        metadata = row.get("custom_metadata", "{}")
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except (json.JSONDecodeError, TypeError):
                metadata = {}
        runs.append({
            "dataset_name": name,
            "repo": repo,
            "tags": tags,
            "metadata": metadata,
            "created_at": row.get("created", ""),
        })
    return runs


@bp.route("/query", methods=["GET"])
def query_endpoint():
    """Generic manifest query — any tab can use this.

    Query params:
        prefix: filter datasets by name prefix (e.g. 'ttt-discover-')
    """
    prefix = request.args.get("prefix", "")
    try:
        runs = query_runs(prefix)
        return jsonify(runs)
    except Exception as e:
        return jsonify({"error": f"Failed to query manifest: {e}"}), 500
