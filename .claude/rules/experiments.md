# Experiments

You help:
- Design experiments
- Red-team experiments (find failure cases and build test jobs called canaries via `/raca:experiment-preflight`)
- Find and schedule jobs on compute clusters or service providers
- Monitor jobs for any changes and outputs
- Alert the user of outputs, analysis, bugs, etc. 
- Resubmit jobs with bug fixes until the experiment is set up correctly
- Keep the dashboard synced up with latest timeline information and artifacts.

When a user asks about any of these things in any way, you should find the experiment they are talking about in `notes/experiments`, and check where the experiment is at currently. Then help the user.

Oftentimes a user may have had an experiment that did not follow best practices as outlined in our rules. You should always fix and spot any issues with how the experiment is being handled to prevent bugs from ruining the experiment's output.

## When Experiments Come Up

Any time the user discusses an experiment (designing, running, reviewing, or even
casually exploring an idea), the `experiment-management` skill must be active. It
handles folder creation, dashboard sync, and state tracking.

The key rule: **create the experiment folder immediately.** Do not wait for the design
to be "complete." Create it as soon as the conversation turns to a concrete experimental
question. The folder is where all plans, briefs, artifacts, and notes accumulate.
If it doesn't exist, things get lost.

After creating or loading the experiment folder, sync the dashboard via
`/raca:dashboard-sync` so it's visible.

This works alongside any design or planning tools. Those handle the conversation;
the experiment-management skill handles the infrastructure.

## Flow

Track state in `notes/experiments/<exp>/flow_state.json`. Read it on session start.
Update it on every phase transition.

```
DESIGN → REDTEAM → CANARY → VALIDATE → RUN → VALIDATE → REVIEW → NEXT
                                                 ↑           |
                                        (each partial)       ↓
                                                        back to DESIGN
```

**DESIGN**: This is the brainstorming stage and you should encourage the user to articulate their main question. Then, you should repeatedly ask and double check that the question they are asking is not solved already with previous literature. Try to ground their ideas in what exists constantly. This process must go from a users fuzzy thoughts on something to a concrete implementable plan that can run on a compute cluster and produce some output. The output MUST BE VISUALIZABLE. This is the last step of design. Ensure the dashboard website `/tools/visualizer` can render the artifacts that are produced by the experiment or if not, make an implementation plan to create one.

Smallest run that tests the hypothesis. What does success/failure look like?
Before designing a big experiment, check the literature — has someone answered this?
Could we just use their results? Write plan to `EXPERIMENT_README.md`, draft `red_team_brief.md` with user.

**REDTEAM**: Anytime an experiment changes (i.e. a new idea, a new baseline, a new model, etc., a good rule of thumb here is anytime we need to run a "job" again or use compute), we must dispatch `/raca:experiment-preflight`. This is a command that will fire off the sub-agent `red-team-reviewer` which is responsible for reviewing the current experiment's design and creating or updating the red-team-brief.md, a file meant to expose potential failure modes of the experiment and how to avoid them. A "canary" job will be proposed as well. IT IS HEAVILY ADVISED TO RUN THE CANARY JOB BECAUSE:
- Canary jobs ensure there are no bugs in the code by actually running the experiment at a small scale.
- Canary jobs MUST ALWAYS produce an artifact that you and the user can review to ensure the format and type of data is correct.
- Canary jobs ensure logic errors are caught early (such as models truncating their responses, etc.)
- Canary jobs are easier to schedule (small jobs, fewer GPUs, fewer hours, etc.)

Ensure the `red-team-reviewer` was dispatched. Cannot skip without user override (log skip with `author: user`).

**CANARY**: These are "mini" jobs that are meant to represent the main experiment to ensure 1. that the main job will run without error and 2. the artifacts, data, and results are the right format and have no issues. This way, when the big job runs, we do not waste time or compute. These should ideally run for 1-2 hours, produce few outputs, but touch every part of the codebase that the main experiment will run to be a real E2E test. Results from the job (actual artifacts) should be uploaded to huggingface. They should be synced to the dashboard `/raca:dashboard-sync`. If no compute is required for the experiment, you should still do a "canary" job, just smaller inference or a smaller scale. 


**VALIDATE**: During the canary run it is vital you are extremely observant of the jobs status (is it running correctly? Any bugs? Did it error?) be proactive in fixing things. AS THE JOB RUNS and produces artifacts (either 1 at the end or multiple throughout) you should be alerting the user of each, inspecting the data of each, and comparing the data with the `red-team-brief.md`. Obvious bugs should be fixed (stack traces, crashes, no outputs, etc.) but you should be proactive about bad data too! If any data produced by the output does not match the expectations or constraints within the `red-team-brief.md` or you think the user would be concerned by the quality of the data you should fix it and or alert the user. (For example, truncated responses in the data).

Pro-tip: You should do this for literally every job. Special mention is given here to "canary" jobs because if we okay a canary job for the real deal experiment, we should be absolutely sure the canary ran fine.


**RUN**: Actually running an experiment should active the skill `run-job` which handles the life-cycles of the experiment including using `/loop` to continuously check the status of the job especially when the job is in a "Pending" state within a Slurm queue. You should always be **VALIDATING** as the job runs (regardless of it being a canary or real job, but especially during canary runs). Ensure you keep your logs up to date for the website, constantly updating the experiments `activity_log.jsonl`, `flow_state.json`, `HUGGINGFACE_REPOS.md` (when new results are produced and uploaded, which should be done ASAP), `EXPERIMENT_README.md`, etc. then call `/raca:dashboard-sync`. Always track where jobs are running (which cluster, locally, or third-party service like RunPod). 

Whatever the job, you must save everything for reproducing that job. This includes the raw sbatch script, the model parameters for inference, the verl training parameters or Llama-Factory training configs. These get saved in their own Huggingface Repo with columns specifically for these values and reproducing jobs. Think to yourself, "in a year, when the user has no idea what this experiment is, what would we need to rerun and produce these exact same results?"

**REVIEW**: Your main output for the user is getting them, as quickly and transparently as possible, all artifacts from the job that were produced in their most advantageous visualized form. For model responses during an batch vLLM job for example, you may upload partial responses to a huggingface dataset and keep updating it with new rows as the job continues, but you alert the user that X rows are available to review (also you should review them to ensure they are "healthy", i.e. not truncated and matches the `red-team-brief.md`). Other examples may be training wandb logs with evaluation scores exported to huggingface with their raw model responses (if your job requires inference at any point, it's almost always guaranteed you should save the raw model outputs, similarly if it requires training you should always save the model checkpoints to huggingface). PARTIAL DATA IS KEY, get data in front of you and the user ASAP. When all data is collected and the job is done, you may analyze the data and report what was found. It's usually best to keep a description of the results on the artifacts on the website in the artifacts tab AND huggingface repo readme. 

What did we find? Show specific data and examples (ALWAYS give examples, the user must TRUST you and trust is established by seeing RAW DATA -- model traces, model parameters, etc.). Write to `EXPERIMENT_README.md`.

**NEXT**: Signal the user and give them all the time they need to dive deep into the data. If you notice the hypotheses were wrong / unsupported or supported and correct and the user specified what to do next, go ahead and continue on. Otherwise, you should let the user look at the results and you should ensure you have everything recorded and uploaded. The artifacts tab of the dashboard should be up to date with artifacts that are valid and up-to-date, if an artifact had a bug in it, it's better to suppress that artifact link to not confuse the user. Ensure each artifact has enough details about them so the user knows what it is.

<critical>
- Every job must produce artifacts intermediately when it runs for more than an hour. This is to ensure we are not wasting compute. We want to see these intermediate outputs and alert the user of them right when they are produced. You must monitor for these via `/loop` or other mechanisms. A job that does not produce intermediate results MUST BE REFACTORED. Missing intermediate artifacts IS A FAILURE MODE.
- It cannot be stressed enough. If you can get data (model responses, training curves, insight, whatever) within 30minutes during a job -- you should produce an artifact and upload it huggingface and sync the dashboard then alert the user (even if the job will run for 12 hours). GET DATA TO THE USER AS FAST AS POSSIBLE.
- Queuing jobs on Slurm clusters can take FOREVER. It is better to build jobs that can run for 2-8 hours, hit the timeout, and then be resumed later. When you make a job, ensure it is completely resume-able. Save the checkpoints, optimizers, cache the responses, whatever. Expect a real experiment to need to be rescheduled 2-4 times throughout its life-cycle. You should be able to get intermediate data to the user so they can see data soon (take an intermediate checkpoint and schedule an eval job for example). But 2-4 jobs spread across 48 hours with intermediate data presented to the user IS BETTER THAN running the full experiment quicker but not seeing anything until it's done completely (too much risk of there being bugs).
</critical>

## Flow State

```json
{
  "phase": "running",
  "hypothesis": "One-line hypothesis",
  "next_action": "What needs to happen next",
  "redteam_status": "pass | pending | skipped-by-user",
  "last_validated_artifact": "org/dataset-name",
  "updated": "2026-03-24T15:30:00Z"
}
```

## The Artifact Chain

Every artifact produced — partial or final, during the canary job or the main job, is uploaded and alerts the user. No exceptions. **This is a step in the
flow, not optional bookkeeping.**

1. **Upload** to HF via `push_dataset_to_hub()` with full metadata and column docs. Use the readme to store information about what the artifact is, the experiment it's associated with, how to reproduce it, if its partial or complete, etc. Use `packages/hf_utility` to help with this, it should also track the dataset in a `X_MANIFEST` huggingface dataset that allows you to find other HF repos. Read more in `.claude/rules/huggingface.md`
2. **Verify** — Load the data from Huggingface, check the `red-team-brief.md` for what the data should look like and refer to the user's expectations from the experiment, then sample a few rows and make sure the content of those rows meet the expectation via dispatching `data-validator` sub-agent.
4. **Sync dashboard** — Update the experiments `HUGGINGFACE_REPOS.md` and then `/raca:dashboard-sync` so that the artifact gets registered on the site.
5. **Log** — Update `activity_log.jsonl` with information about what was in the artifact, did it pass our validation, if not why, etc.

If you produced an artifact and didn't run this chain, you skipped a step. Go back. You should be monitoring for new artifacts throughout the time the job is running (jobs may produce many artifacts as they run throughout their time running and then more when they finish). You DO NOT WAIT until the job is finished, you process artifacts AS THEY COME IN.

## The Dashboard Is the Control Plane

The visualizer (`tools/visualizer/`, always local but for some users who want it, it can be live in a HF Space) is where the user
monitors experiments. It shows READMEs, notes, timelines, artifacts, everything. It is open 24/7.

**Every state change must be visible on the dashboard.** If you uploaded data, updated notes,
logged to the activity log, or changed experiment status: run `/raca:dashboard-sync`. If the user
can't see it on the website, it didn't happen.

## Artifact Health

<critical>
- NEVER truncate model outputs. Store FULL output always. No `text[:500]`, no post-processing. This means, NO TRUNCATION from max-model-length (parameters during inference), NO TRUNCATION WHEN SAVING (i.e. the model produced the full thing but you cut it off short for storing in huggingface or something). Think "How do I get the user to TRUST my experiment", truncation of a models response OR not saving/showing the models response on an inference task is a great example of an anti-trust pattern — where the user would actively distrust you. This would be the worst possible outcome for an experiment. Abstract the model truncation example to any intermediate output, you must be as TRANSPARENT AS POSSIBLE.
- ALWAYS use the model's maximum supported generation length. Below 8192 for generative tasks is almost certainly wrong. Thinking models (Qwen3, DeepSeek-R1): 32k-128k.  You may be incentivized to optimize the experiment for speed, BUT NEVER SACRIFICE EXPERIMENTAL INTEGRITY FOR THE SAKE OF SPEED. Remember, TRUST is the primary motivation you should have when running experiments -- do you trust the experiments results and will the user.
- ALWAYS upload artifacts to HF immediately after creation. To prevent creating N huggingface repos per artifact you should APPEND to the intermediate huggingface artifact repos BUT STILL update the websites timeline and ALERT the user that NEW RESULTS HAVE BEEN ADDED. Details on how to find those new rows (especially for large datasets) are extremely valuable.
- Datasets and Models >50GB: flag to user before upload.
- Training metrics go to wandb. Everything else goes to HF. Label all runs (dev and production). TEST YOUR WANDB CONNECTION! If it is not available on the server you are going to run on THIS IS A CRITICAL BUG -- Remember, getting data in front of the user is IMPERATIVE. If you cannot display the WanDB data to the user, the user has to wait extra long for insight on how the experiment is running. THIS IS A BAD OUTCOME. 
- When OOM or timeout: fix root cause (grad accum, TP, offloading). NEVER shrink generation length, reduce batch size, or skip samples, these are shortcuts. IF YOU DO NOT KNOW WHAT TO DO -- engage the user. ALWAYS COMPARE with the `red-team-brief.md` before changing experimental parameters, IF YOU CHANGE THE EXPERIMENT, rerun `/raca:experiment-preflight`, you may need to run a new canary too!
</critical>

## Hard Gates

- **No compute without red-team.** If `redteam_status` is `pending`, do not submit any job.
- **No analysis before validation.** Latest artifact must have data-validator CLEAN.
- **No silent parameter changes.** Any change to max_tokens, batch size, sample count, epochs, temperature, or model requires user approval. Always be upfront with what you are doing and be able to summarize what you did to the user with clear reasons. Remember TRUST and INTEGRITY for the experiment are paramount, SPEED is second.

## Streaming & Partial Results

Jobs >1 hour MUST upload partial results to HF as they run:
- Inference: every ~30 min or N samples
- Training: wandb metrics real-time + checkpoints every N steps + jobs scheduled intermittently for evaluations (for example: The user may want to visualize a specific set of queries from a trained model, it may be beneficial to sample 1-10 of those queries, spin up a quick job for multiple checkpoints as they are produced during training, and upload those artifacts so the user can see if the model is doing what they expect throughout training).
- Eval: scored results incrementally
- Remember: DATA + RESULTS + INSIGHT AS QUICK AS POSSIBLE

While jobs are running (especially between sequential jobs): validate partials (sample rows, check truncation, scores).
If flawed — kill remaining jobs NOW. Log go/no-go to activity log. ALERT USER.

The user should NEVER wait until a job finishes to see what's happening. IF THEY DO THIS IS A BAD OUTCOME!

## Job Design

- Short resumable jobs (4-8h) over long jobs. They schedule faster and produce partials.
- Scripts must be resumable from checkpoints. Training: frequent checkpoints. Inference: append JSONL.
- Before submitting: model name correct, max_tokens adequate, reward function tested on >=2 examples, checkpointing enabled, wandb configured. YOU MUST MAKE SURE THESE ARE CORRECT. Watch the logs of a running job -- if they are not working as expected you should kill them before they run too long!

## Autonomous Boundaries

**Can do**: Fix OOM (grad accum, TP, offloading), retry transient errors, install deps,
resume from checkpoints, alternate partitions, download/upload/visualize results.

**Cannot do without user**: Change experimental parameters, switch models, skip conditions,
switch clusters, exceed compute budget, modify Red Team Brief.
