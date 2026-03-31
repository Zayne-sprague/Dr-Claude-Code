---
description: "Create or update a benchmark/dataset/task reference file. Use when adding a new benchmark, correcting evaluation details, or enriching an existing entry with new information."
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Agent", "WebSearch", "WebFetch"]
argument-hint: "<benchmark_name> [correction or additional info]"
---

# Handle Benchmark Reference

Reference files live at `.claude/references/datasets_and_tasks/{name}.md`.
The index lives at `.claude/references/datasets_and_tasks/datasets_and_tasks_map.md`.

The argument has two parts:
1. **Benchmark name** (required) — first word or quoted phrase (e.g., `Countdown`, `"GSM8K"`, `"SWE-bench Verified"`)
2. **Context** (optional) — everything after the name. This is either:
   - A correction ("Countdown evaluation should check equation validity, not direct string match")
   - Additional info to merge ("add that GSM8K has 8.5K training examples")
   - Empty — means "create from scratch" or "review and enrich existing"

## Step 1: Determine mode

```
IF reference file exists for this benchmark:
  IF context provided → UPDATE mode (apply correction / add info)
  IF no context      → ENRICH mode (research and fill gaps)
ELSE:
  CREATE mode (build from scratch)
```

Read the existing file if it exists. Read `datasets_and_tasks_map.md` to check for an entry.

Normalize the benchmark name to a filename: lowercase, hyphens for spaces, no special chars.
Example: "SWE-bench Verified" → `swe-bench-verified.md`

## Step 2: Research (CREATE and ENRICH modes)

Use web search and paper search to find authoritative sources. Prioritize:
1. The original paper introducing the benchmark
2. Official HuggingFace dataset page (if it exists)
3. Official code repository
4. Leaderboard or evaluation harness docs (e.g., lm-evaluation-harness, BigCode, HELM)

Gather enough to fill every section in the template below. If a section cannot be filled, mark it `*Unknown — needs investigation*`.

## Step 3: Write or update the reference file

### CREATE mode

Write a new file using this template:

```markdown
# {Benchmark Name}

## Overview

{2-3 sentence description: what does this benchmark measure, who introduced it, why does it matter}

- **Introduced in:** {Paper title} ({Authors}, {Year}) — [{arxiv link}]({url})
- **Official HuggingFace:** [{org/dataset}]({url}) or *None*
- **Code repo:** [{org/repo}]({url}) or *None*
- **Leaderboard:** [{name}]({url}) or *None*

## Task Description

{What does the model need to do? Be specific. Include input/output format, number of examples/splits, any subtasks or difficulty levels.}

## Evaluation

### Method
{How are answers scored? Direct string match, equation equivalence, LLM-as-judge, execution-based, F1, exact match, pass@k, etc. Be precise — this is what experiment code will rely on.}

### Metric(s)
{Primary metric and any secondary metrics. Include formulas or references if non-obvious.}

### Known Pitfalls
{Common mistakes in evaluation: wrong normalization, off-by-one in pass@k, answer extraction regex failures, etc.}

## Running It

### Requirements
{Does it need Docker, a sandbox, network access, a compiler, specific packages? Is it agentic / multi-turn? How long does a typical run take?}

### Recommended Setup
{Best way to run: lm-eval-harness task name, custom script, official repo instructions, etc. Link to working configs if available.}

### Prompt / Few-Shot Format
{Reference prompt template or describe the standard format. Include few-shot count if conventional. If there's a canonical prompt, quote it in a code block.}

## Typical Results

{Brief table or notes on SOTA / baseline performance ranges so we know if our numbers are in the right ballpark.}

| Model | Score | Source |
|-------|-------|--------|

## Setup Checklists

Context-specific questions to resolve BEFORE writing code. These prevent common mistakes and wasted compute by surfacing ambiguities early. Not every benchmark needs all three sections — include only those that apply.

### For Evaluation
{Bulleted list of questions you should answer before writing an evaluation script for this task. Focus on: answer extraction, scoring edge cases, metric configuration, dataset split selection, prompt format.}

### For Distillation / Data Generation
{Bulleted list of questions you should answer before generating training data from this task. Focus on: output format, trace style, filtering criteria, dataset size, deduplication, quality checks.}

### For RL Training
{Bulleted list of questions you should answer before setting up an RL training run with this task as the reward signal. Focus on: reward function design, format reward, partial credit, hyperparameter choices tied to the task, known failure modes.}

## Notes

{Anything else: known dataset contamination issues, version differences, community conventions, licensing.}
```

### UPDATE mode

Read the existing file. Apply the correction or addition from the user's context:
- If the user says something is WRONG: find and replace the incorrect information. Remove outdated text entirely — do not leave contradictory statements.
- If the user adds new information: merge it into the appropriate section.
- Preserve all other content unchanged.

**Setup Checklists maintenance:** If the update changes evaluation method, reward design, data format, or any detail that would affect how someone sets up an experiment, check whether the Setup Checklists section needs a corresponding update. For example, if the user corrects "use equation evaluation not string match," add or update the relevant checklist question (e.g., "Are you evaluating via equation evaluation or string match?"). The checklists should always reflect the current state of knowledge in the file.

After editing, re-read the file to verify consistency. If the correction affects the map entry (e.g., changes tags or description), update that too.

### ENRICH mode

Read the existing file. Identify sections that are empty, marked unknown, or thin. Research and fill them. Do not overwrite information that's already correct.

**Setup Checklists:** If the file has no "Setup Checklists" section, or if it has placeholder/thin checklists, generate the questions based on the task's characteristics. Derive questions from the Evaluation, Running It, and Known Pitfalls sections — each pitfall or configurable parameter is a candidate checklist question. Only include checklist sections that are relevant to the benchmark (e.g., a pure evaluation benchmark with no RL reward signal doesn't need an RL section).

## Step 4: Update the index

After the reference file is written/updated, update `datasets_and_tasks_map.md`.

The index format:

```markdown
# Datasets and Tasks Reference

| Benchmark | File | Tags | Description |
|-----------|------|------|-------------|
| GSM8K | [gsm8k.md](gsm8k.md) | math, reasoning, few-shot | Grade school math word problems, 8.5K examples |
| Countdown | [countdown.md](countdown.md) | math, reasoning, rl-reward | Reach target number using arithmetic operations |
```

- **Tags** should be concise, lowercase, comma-separated. Common tags: `math`, `reasoning`, `code`, `agentic`, `multi-turn`, `rl-reward`, `few-shot`, `language`, `knowledge`, `safety`, `instruction-following`, `long-context`, `tool-use`
- **Description** should be one line, under 100 chars
- If the benchmark already has an entry, update it if the description or tags changed
- Keep the table sorted alphabetically by benchmark name

## Step 5: Confirm

Report to the user:
- **Mode**: CREATE / UPDATE / ENRICH
- **File**: path to the reference file
- **What changed**: brief summary of sections written or modified
- If UPDATE mode: quote the specific correction applied
