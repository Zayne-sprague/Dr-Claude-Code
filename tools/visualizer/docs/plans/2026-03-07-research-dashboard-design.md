# Research Dashboard Design

**Date:** 2026-03-07
**Status:** Approved

## Overview

Extend the existing agg_visualizer into a parent "Research Dashboard" website with a top-level navigation bar. The current visualizer becomes one page; a new Experiments page provides a control pane for tracking experiments, hypotheses, runs, and artifacts.

Deployed on HuggingFace Spaces (same Space as the current visualizer).

## Audience

Primarily the researcher + advisor. May expand to a small team later.

## Architecture

### Navigation
- Top-level nav bar: `Experiments | Visualizer` (future: Research Map, Knowledge Base)
- State-driven view switching (useState), not URL routing (HF Spaces doesn't support deep-linking)
- Current visualizer tabs (Model Trace, Arena, RLM, etc.) nest inside the Visualizer page unchanged

### Data Storage
- JSON files in HF dataset repo `your-org/RESEARCH_DASHBOARD`
- Three files: `experiments.json`, `runs.json`, `sub_experiments.json`
- In-memory cache with async HF upload (same pattern as presets.py)
- Local JSON fallback in `backend/data/`

### Backend API
Blueprint at `/api/experiments/`:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List all experiments |
| POST | `/` | Create experiment |
| GET | `/:id` | Full detail (includes runs + subs) |
| PUT | `/:id` | Update experiment |
| DELETE | `/:id` | Delete experiment |
| POST | `/:id/runs` | Add run record |
| PUT | `/:id/runs/:run_id` | Update run |
| DELETE | `/:id/runs/:run_id` | Delete run |
| POST | `/:id/subs` | Add sub-experiment |
| PUT | `/:id/subs/:sub_id` | Update sub-experiment |
| DELETE | `/:id/subs/:sub_id` | Delete sub-experiment |
| POST | `/sync` | Force re-download from HF |
| POST | `/import` | Bulk import (experiment.yaml format) |

### Data Model

**Experiment:**
- id, name, research_project, hypothesis (statement, type, status, success_criteria)
- stage, completeness (0-5), models[], tasks[], tags[]
- hf_repos[] (repo, description, date), wandb_url, notes (markdown)
- created, updated timestamps

**Run Record:**
- id, experiment_id, condition, model, cluster, status
- hf_dataset, metrics (dict), timestamp, notes

**Sub-experiment:**
- id, experiment_id, name, hypothesis, status
- content_md (full markdown report), hf_repos[]
- created, updated timestamps

### Frontend

Three drill-down levels:

1. **Experiment List** — Cards with name, hypothesis, status badge, completeness, tags, last updated. Sort/filter controls.
2. **Experiment Detail** — Hypothesis header, tabbed views (Overview, Runs, Datasets, Sub-experiments). Inline editing.
3. **Sub-experiment View** — Breadcrumb, header, markdown-rendered body, HF repos, edit toggle.

### Integration Points
- exp-runner v2 pushes data via `/api/experiments/import`
- Flexible ingestion — API accepts data from any source
- No local filesystem dependency at runtime

## Future Pages (Phase 2+)
- **Research Map** — Graph/board view of research directions and experiment relationships
- **Knowledge Base** — Searchable wiki of findings, notes, HF repos

## Tech Stack
- Backend: Flask (existing)
- Frontend: React + Vite + Tailwind + Zustand (existing)
- Deployment: Docker on HuggingFace Spaces (existing)
- Storage: HF dataset repo as JSON store
