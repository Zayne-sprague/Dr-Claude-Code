# Onboarding Experiment: Countdown with Qwen3-1.7B

## Purpose

This is your first experiment with RACA. It walks you through the entire pipeline:

1. **Design** — define a hypothesis and success criteria
2. **Red-team** — review the experiment for potential issues before burning compute
3. **Canary** — run a tiny sample (5-10 problems) to catch bugs early
4. **Run** — full experiment with the configured sample count
5. **Validate** — check data quality, upload to HuggingFace
6. **Review** — analyze results, document findings
7. **Dashboard** — view results in the experiment dashboard

## The Task: Countdown

Countdown is an arithmetic reasoning task. The model is given a set of numbers and a target, and must find an arithmetic expression using those numbers that equals the target.

Example: Given numbers `[2, 5, 8]` and target `10`, a valid solution is `2 + 8 = 10`.

See `.claude/references/datasets_and_tasks/countdown.md` for the full task specification, prompt format, and evaluation method.

## The Model: Qwen3-1.7B

We use a small model (1.7B parameters) so the experiment runs quickly — minutes, not hours. This lets you see the full cycle without waiting.

## What You'll Learn

- How experiment folders are structured
- How the lifecycle flow works (design → red-team → canary → run → review)
- How artifacts are uploaded to HuggingFace
- How the dashboard displays your results
- How to document findings

## Your Notes

Your personal notes go in `user/`:
- `user/FINDINGS.md` — what you discovered
- `user/DECISIONS.md` — decisions you made and why
- `user/summary.md` — executive summary when done

## Dashboard

Results are visible in the Model Trace viewer on your dashboard. Each model response shows the full reasoning trace.
