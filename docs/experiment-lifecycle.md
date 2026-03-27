# Experiment Lifecycle

Every experiment follows the same eight-phase flow. No shortcuts.

```
DESIGN → REDTEAM → CANARY → VALIDATE → RUN → VALIDATE → REVIEW → NEXT
                                                 ↑           |
                                        (each partial)       ↓
                                                        back to DESIGN
```

Phase state is tracked in `notes/experiments/<exp>/flow_state.json` and updated on every transition.

---

## DESIGN

**What's the hypothesis? What does success look like? What's the smallest run that tests it?**

Before designing anything large, check the literature. Has someone already answered this question? Could you use their results instead of running your own experiment?

When you're ready to design:

- Write the hypothesis in one sentence
- Define what a positive result looks like and what a negative result looks like
- Scope the smallest possible run that distinguishes the two — often 50-100 samples is enough to get signal
- Write the plan to `EXPERIMENT_README.md`
- Draft `red_team_brief.md` with the user

Don't jump to the full run. Prove the idea works first.

---

## REDTEAM

**An agent reviews your experiment design before any compute runs.**

The red-team-reviewer agent reads your experiment plan and challenges it:

- Is the hypothesis falsifiable?
- Are there missing baselines or confounds?
- Is the evaluation metric appropriate?
- Would a simpler experiment answer the same question?
- Is the compute budget proportional to the expected insight?

This phase cannot be skipped without explicit user override (logged with `author: user`). If the red-team finds serious issues, go back to DESIGN.

A clean red-team report is a prerequisite for any job submission.

---

## CANARY

**Run 5-10 samples. Upload to HuggingFace. Then validate.**

The canary is a smoke test for your pipeline, not a scientific result. You're checking:

- Does the script run end-to-end without errors?
- Is the output format correct?
- Are model outputs complete (not truncated)?
- Do scores fall in a plausible range?

Submit the canary job, wait for it to finish, then immediately move to VALIDATE before drawing any conclusions.

---

## VALIDATE

**Every artifact gets checked. No exceptions.**

Every time an artifact lands — canary, partial, or final — run the full artifact chain:

1. Upload to HuggingFace via `hf_utility.push_dataset_to_hub()` with full metadata
2. Load back from HF, check row count, sample 3-5 rows, inspect content
3. Dispatch the data-validator agent
4. Run `/sync-dashboard`
5. Write an activity log entry with counts, token lengths, score ranges

If the data-validator finds problems — truncation, missing rows, anomalous scores — stop and fix before proceeding. Don't run the full experiment on a broken pipeline.

You also review for scientific substance: does the canary output look like it's testing what you think it's testing?

---

## RUN

**Submit the full experiment. Upload partial results as they arrive.**

For jobs longer than one hour, partial results must be uploaded to HuggingFace as the job runs — every ~30 minutes or every N samples. The user should never have to wait until a job finishes to see what's happening.

As each partial arrives:
- Run VALIDATE on it
- Assess the signal: is the experiment working?
- Make a go/no-go decision in the activity log

If you find bugs mid-run, stop the remaining jobs, fix the issue, and re-run. Don't burn compute collecting broken data.

---

## REVIEW

**What did we learn? Show data, not just conclusions.**

Write findings to `EXPERIMENT_README.md`. A good review:

- States the hypothesis and whether it was supported
- Shows specific examples from the data — not just aggregate numbers
- Notes unexpected findings, edge cases, failure modes
- Compares against baselines concretely
- Identifies what the results don't tell you

Don't summarize. Show the actual outputs, the actual scores, the actual distribution. The reader should be able to verify your conclusions from the data you present.

---

## NEXT

**Signal → scale up. No signal → rethink. Unexpected → new hypothesis.**

After review, decide what comes next:

- **Signal found**: scale the experiment up. More samples, more models, more conditions. Return to DESIGN with a tighter hypothesis.
- **No signal**: was the experiment testing the right thing? Is the hypothesis wrong, or is the test too weak? Return to DESIGN.
- **Unexpected result**: this is often the most valuable outcome. What does it imply? Form a new hypothesis and start a new experiment.

Every outcome is useful. The goal is the quickest path to real insight, not confirmation of what you already believed.
