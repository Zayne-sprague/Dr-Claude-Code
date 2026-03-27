"""Import all experiment data from local files into the Research Dashboard HF repo."""

import json
import os
import re
import tempfile
import uuid
import yaml
from pathlib import Path
from huggingface_hub import HfApi

EXPERIMENTS_DIR = Path(os.environ.get("EXPERIMENTS_DIR", "./notes/experiments"))
HF_ORG = os.environ.get("HF_ORG", "your-org")
DASHBOARD_REPO = f"{HF_ORG}/RESEARCH_DASHBOARD"

# Experiments to exclude from dashboard import. All others are auto-discovered.
EXCLUDED_EXPERIMENTS: set[str] = set()

STAGE_MAP = {
    "supported": "concluded",
    "invalidated": "concluded",
    "inconclusive": "inconclusive",
    "exploring": "active",
    "active": "active",
    "pending": "planned",
}


def compute_completeness(exp_dir: Path, config: dict) -> int:
    score = 0
    if (exp_dir / "questions.md").exists():
        score += 1
    if (exp_dir / "EXPERIMENT_README.md").exists():
        score += 1
    if (exp_dir / "HUGGINGFACE_REPOS.md").exists():
        score += 1
    if (exp_dir / "experiment.yaml").exists():
        score += 1
    sub_dir = exp_dir / "experiments"
    if sub_dir.exists() and any(sub_dir.glob("*.md")):
        score += 1
    return score


def parse_hf_repos(content: str) -> list[dict]:
    """Extract HF repo links from HUGGINGFACE_REPOS.md markdown tables."""
    repos = []
    seen = set()
    # Match markdown links like [name](https://huggingface.co/datasets/org/repo)
    link_pattern = re.compile(r'\[([^\]]*)\]\(https://huggingface\.co/datasets/([^)]+)\)')
    for match in link_pattern.finditer(content):
        name, repo = match.groups()
        if repo not in seen:
            seen.add(repo)
            repos.append({"repo": repo, "description": name.strip(), "date": ""})

    # Also match plain repo references like {HF_ORG}/something
    hf_org = os.environ.get("HF_ORG", "your-org")
    plain_pattern = re.compile(rf'(?:^|\s)({re.escape(hf_org)}/[\w-]+)')
    for match in plain_pattern.finditer(content):
        repo = match.group(1).strip()
        if repo not in seen:
            seen.add(repo)
            repos.append({"repo": repo, "description": "", "date": ""})

    return repos


def load_experiment(exp_dir: Path) -> tuple[dict, list[dict], list[dict], list[dict], list[dict]]:
    """Load a single experiment directory. Returns (experiment, runs, sub_experiments, experiment_notes, activity_log)."""
    name = exp_dir.name

    # Load config
    config = {}
    config_path = exp_dir / "experiment.yaml"
    if config_path.exists():
        with open(config_path) as f:
            config = yaml.safe_load(f) or {}

    # Hypothesis
    hyp_raw = config.get("hypothesis", {})
    if isinstance(hyp_raw, str):
        hyp_raw = {"statement": hyp_raw}
    hypothesis = {
        "statement": hyp_raw.get("statement", ""),
        "type": hyp_raw.get("type", "exploration"),
        "status": hyp_raw.get("status", "pending"),
        "success_criteria": hyp_raw.get("success_criteria", ""),
    }

    # Stage from hypothesis status
    stage = STAGE_MAP.get(hypothesis["status"], "active")
    if not (exp_dir / "EXPERIMENT_README.md").exists() and not config:
        stage = "idea"

    # Models
    models_raw = config.get("models", [])
    models = []
    for m in models_raw:
        if isinstance(m, dict):
            mid = m.get("id", "")
            # Clean up provider prefix for display
            short = mid.split("/")[-1] if "/" in mid else mid
            if short and short not in models:
                models.append(short)
        elif isinstance(m, str) and m not in models:
            models.append(m)

    # Tasks
    tasks = []
    eval_cfg = config.get("evaluation", {})
    if isinstance(eval_cfg, dict):
        task = eval_cfg.get("task", "")
        if task:
            tasks.append(task)
        extra_tasks = eval_cfg.get("extra", {}).get("additional_tasks", [])
        tasks.extend(extra_tasks)

    # Tags
    obs = config.get("observability", {})
    tags = obs.get("tags", []) if isinstance(obs, dict) else []

    # Notes from EXPERIMENT_README.md
    notes = ""
    readme_path = exp_dir / "EXPERIMENT_README.md"
    if readme_path.exists():
        with open(readme_path) as f:
            notes = f.read()

    # HF repos
    hf_repos = []
    hf_path = exp_dir / "HUGGINGFACE_REPOS.md"
    if hf_path.exists():
        with open(hf_path) as f:
            hf_repos = parse_hf_repos(f.read())

    # Wandb
    wandb_project = obs.get("wandb_project", "") if isinstance(obs, dict) else ""
    wandb_url = f"https://wandb.ai/{wandb_project}" if wandb_project else ""

    # Completeness
    completeness = compute_completeness(exp_dir, config)

    # Zayne's custom files (zaynes/ folder)
    def _load_zayne_file(filename: str) -> str:
        p = exp_dir / "zaynes" / filename
        if p.exists():
            with open(p) as f:
                content = f.read().strip()
            if content and not content.startswith("<!--"):
                return content
        return ""

    zayne_summary = _load_zayne_file("summary.md")
    zayne_readme = _load_zayne_file("README.md")
    zayne_findings = _load_zayne_file("FINDINGS.md")
    zayne_decisions = _load_zayne_file("DECISIONS.md")

    # Red team brief
    red_team_brief = ""
    rtb_path = exp_dir / "red_team_brief.md"
    if rtb_path.exists():
        with open(rtb_path) as f:
            red_team_brief = f.read()

    experiment = {
        "id": name,
        "name": config.get("name", name).replace("_", " ").replace("-", " ").title(),
        "research_project": config.get("research_project", ""),
        "hypothesis": hypothesis,
        "stage": stage,
        "completeness": completeness,
        "models": models,
        "tasks": tasks,
        "tags": tags,
        "hf_repos": hf_repos,
        "wandb_url": wandb_url,
        "notes": notes,
        "zayne_summary": zayne_summary,
        "zayne_readme": zayne_readme,
        "zayne_findings": zayne_findings,
        "zayne_decisions": zayne_decisions,
        "red_team_brief": red_team_brief,
        "created": config.get("created", ""),
        "updated": config.get("updated", ""),
    }

    # Runs from config
    runs = []
    for run_raw in config.get("runs", []):
        run = {
            "id": run_raw.get("run_id", f"run_{uuid.uuid4().hex[:8]}"),
            "experiment_id": name,
            "condition": run_raw.get("condition", ""),
            "model": run_raw.get("model", "").split("/")[-1] if run_raw.get("model") else "",
            "cluster": run_raw.get("cluster", "local"),
            "status": run_raw.get("status", "completed"),
            "hf_dataset": run_raw.get("hf_dataset", ""),
            "metrics": run_raw.get("metrics", {}),
            "timestamp": run_raw.get("timestamp", ""),
            "notes": run_raw.get("notes", ""),
        }
        runs.append(run)

    # Sub-experiments
    sub_experiments = []
    sub_dir = exp_dir / "experiments"
    if sub_dir.exists():
        for md_file in sorted(sub_dir.glob("*.md")):
            sub_name = md_file.stem.replace("_", " ").title()
            with open(md_file) as f:
                content = f.read()

            # Try to extract hypothesis from first few lines
            sub_hypothesis = ""
            for line in content.split("\n")[:20]:
                if "hypothesis" in line.lower() or "question" in line.lower():
                    sub_hypothesis = line.strip().lstrip("#").lstrip("*").strip()
                    break

            sub_id = f"{name}__{md_file.stem}"
            sub = {
                "id": sub_id,
                "experiment_id": name,
                "name": sub_name,
                "hypothesis": sub_hypothesis,
                "status": "active",
                "content_md": content,
                "hf_repos": parse_hf_repos(content),
                "created": config.get("created", ""),
                "updated": config.get("updated", ""),
            }
            sub_experiments.append(sub)

    # Collect ALL .md and .yaml files related to this experiment, organized by path
    RESEARCH_ROOT = Path(os.environ.get("WORKSPACE", Path.home() / "Research"))
    SKIP_DIRS = {"old", "__pycache__", ".venv", "node_modules", ".git", "zaynes"}
    experiment_notes = []
    seen_paths = set()

    NOTES_DIR = RESEARCH_ROOT / "notes"

    def _add_file(file_path: Path):
        """Add a .md file to experiment_notes with its relative path."""
        if file_path in seen_paths:
            return
        if file_path.suffix != ".md":
            return
        seen_paths.add(file_path)
        try:
            rel_path = str(file_path.relative_to(NOTES_DIR))
        except ValueError:
            try:
                rel_path = str(file_path.relative_to(RESEARCH_ROOT))
            except ValueError:
                rel_path = str(file_path)
        note_id = f"{name}__note_{rel_path.replace('/', '_').replace('.', '_')}"
        with open(file_path) as f:
            note_content = f.read()
        experiment_notes.append({
            "id": note_id,
            "experiment_id": name,
            "title": file_path.name,
            "filename": file_path.name,
            "relative_path": rel_path,
            "content_md": note_content,
            "created": config.get("created", ""),
            "updated": config.get("updated", ""),
        })

    def _walk_dir(directory: Path):
        """Recursively collect .md files from a directory."""
        if not directory.exists():
            return
        for item in sorted(directory.iterdir()):
            if item.name.startswith(".") or item.name in SKIP_DIRS:
                continue
            if item.is_dir():
                _walk_dir(item)
            elif item.suffix == ".md":
                _add_file(item)

    # 1) All .md files in the experiment directory itself (recursive)
    _walk_dir(exp_dir)

    # 2) note_sources from config (within ~/Research/notes/)
    for source_dir in config.get("note_sources", []):
        source_path = Path(source_dir).expanduser()
        _walk_dir(source_path)

    # 3) Related works paths (papers that are local .md files)
    for paper_ref in config.get("related_works", {}).get("papers", []):
        if isinstance(paper_ref, str) and not paper_ref.startswith("arXiv"):
            paper_path = RESEARCH_ROOT / paper_ref
            if paper_path.exists() and paper_path.suffix == ".md":
                _add_file(paper_path)

    # Activity log
    activity_log = []
    log_path = exp_dir / "activity_log.jsonl"
    if log_path.exists():
        with open(log_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        activity_log.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass

    return experiment, runs, sub_experiments, experiment_notes, activity_log


def main():
    all_experiments = []
    all_runs = []
    all_subs = []
    all_notes = []
    all_activity_logs = {}

    for exp_dir in sorted(EXPERIMENTS_DIR.iterdir()):
        if not exp_dir.is_dir():
            continue
        if exp_dir.name.startswith((".","_")) or exp_dir.name == "old":
            continue
        if exp_dir.name in EXCLUDED_EXPERIMENTS:
            continue

        print(f"Loading: {exp_dir.name}")
        exp, runs, subs, notes, activity_log = load_experiment(exp_dir)
        all_experiments.append(exp)
        all_runs.extend(runs)
        all_subs.extend(subs)
        all_notes.extend(notes)
        if activity_log:
            all_activity_logs[exp_dir.name] = activity_log
        print(f"  -> {len(runs)} runs, {len(subs)} sub-experiments, {len(notes)} notes, {len(exp.get('hf_repos', []))} HF repos, {len(activity_log)} activity log entries")

    print(f"\nTotal: {len(all_experiments)} experiments, {len(all_runs)} runs, {len(all_subs)} sub-experiments, {len(all_notes)} notes, {len(all_activity_logs)} experiments with activity logs")

    # Load artifact data from PROJECT-MANIFEST
    artifacts = []
    try:
        from datasets import load_dataset
        manifest_ds = load_dataset(f"{HF_ORG}/PROJECT-MANIFEST", split="train")
        for row in manifest_ds:
            # Only include entries with experiment_id (artifact-pipeline entries)
            if row.get("experiment_id"):
                artifacts.append({k: v for k, v in row.items()})
        print(f"Loaded {len(artifacts)} artifact entries from manifest")
    except Exception as e:
        print(f"Warning: Could not load manifest: {e}")

    # Load summary findings
    summary_path = EXPERIMENTS_DIR / "summary_findings.md"
    summary_findings = []
    if summary_path.exists():
        with open(summary_path) as f:
            content = f.read()
        summary_findings = [{"content_md": content, "updated": os.path.getmtime(summary_path)}]
        print(f"Loaded summary_findings.md ({len(content)} chars)")

    # Upload to HF
    api = HfApi()
    try:
        api.create_repo(DASHBOARD_REPO, repo_type="dataset", exist_ok=True)
    except Exception:
        pass

    for name, data in [("experiments", all_experiments), ("runs", all_runs), ("sub_experiments", all_subs), ("experiment_notes", all_notes), ("summary_findings", summary_findings), ("activity_logs", all_activity_logs), ("artifacts", artifacts)]:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(data, f, indent=2, default=str)
            tmp = f.name
        print(f"Uploading {name}.json ({len(data)} records)...")
        api.upload_file(
            path_or_fileobj=tmp,
            path_in_repo=f"{name}.json",
            repo_id=DASHBOARD_REPO,
            repo_type="dataset",
        )
        os.unlink(tmp)

    print("\nDone! Data uploaded to", DASHBOARD_REPO)
    hf_space = os.environ.get("HF_SPACE_URL", "https://your-space.hf.space")
    print(f"Sync the dashboard: curl -X POST {hf_space}/api/experiments/sync")


if __name__ == "__main__":
    main()
