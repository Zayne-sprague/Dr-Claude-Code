# Countdown

## Overview

Countdown is an arithmetic reasoning task inspired by the British TV show "Countdown." Given a set of numbers and a target value, the model must compose an arithmetic expression using the available numbers and basic operations (+, -, *, /) to reach the target. It has become the de facto toy task for RL post-training research (GRPO, PPO, DAPO) due to its simple, verifiable reward signal and ability to elicit emergent reasoning behaviors (self-verification, search, "aha moments").

- **Introduced in:** Popularized for LLM RL by [TinyZero](https://github.com/Jiayi-Pan/TinyZero) (Jiayi Pan et al., 2025) as a reproduction of DeepSeek R1-Zero. The task itself originates from the TV game show.
- **Official HuggingFace:** [Jiayi-Pan/Countdown-Tasks-3to4](https://huggingface.co/datasets/Jiayi-Pan/Countdown-Tasks-3to4) — 490K examples, 3-4 operands, targets 10-99
- **Code repo:** [Jiayi-Pan/TinyZero](https://github.com/Jiayi-Pan/TinyZero) (original), plus implementations in verl, TRL, Swift
- **Leaderboard:** *None* — task difficulty is configurable, so results are only comparable within identical configs

## Task Description

**Input:** A target integer and a list of $N$ integers (operands).

**Output:** An arithmetic expression using some or all of the operands and the operations $\{+, -, \times, \div\}$ that evaluates to the target.

**Configurable parameters:**

| Parameter | TinyZero default | Common RL range |
|-----------|-----------------|-----------------|
| Number of operands ($N$) | 3-4 | 2-6 |
| Target range | 10-99 | 1-1000 |
| Operand range | 0-99 | 1-100 |
| Require all numbers used | varies | varies |

**Difficulty scaling:** More operands and larger target ranges make the task harder. $N=4$ with targets up to 1000 is a common "hard" setting. $N=2$ or $N=3$ with small targets is used for quick canary runs.

**Output format (RL training):** Typically wrapped in structured tags:
```
<think>
[reasoning trace]
</think>
<answer>
[arithmetic expression]
</answer>
```

## Evaluation

### Method

**Equation evaluation — NOT direct string matching.** The model's answer is parsed as an arithmetic expression and evaluated programmatically. The evaluation checks three things:

1. **Number validity:** Every number used in the expression must come from the available set. Each number can be used at most once (checked via multiset/Counter comparison).
2. **Operation validity:** Only $+, -, \times, \div$ and parentheses are allowed.
3. **Correctness:** The expression must evaluate to the target (within floating-point tolerance, typically $|result - target| < 10^{-5}$).

Some implementations also enforce:
- All intermediate results must be non-negative integers (division must be exact)
- All available numbers must be used (not just a subset)

### Metric(s)

- **Primary:** Accuracy (fraction of problems solved correctly), i.e. reward = 1.0 if correct, 0.0 if not
- **Format reward (optional):** Some setups give partial credit (e.g., 0.1) for producing a parseable answer in the correct `<answer>` tags even if the equation is wrong
- **For RL training:** The reward function returns per-sample scores used directly by GRPO/PPO

### Known Pitfalls

- **Direct string matching is WRONG.** The answer "5 + 3" and "3 + 5" both equal 8 — string comparison would reject one. Always evaluate the expression.
- **`eval()` is dangerous.** TinyZero's reference implementation uses Python `eval()` with restricted globals. Prefer AST-based safe evaluation (see our `CountdownJudge` below).
- **Number reuse bugs.** A common mistake is checking if numbers appear in the expression via `set` instead of `Counter`/multiset. If the available numbers are `[5, 5, 3]`, the model is allowed to use 5 twice.
- **Intermediate result constraints.** Some formulations require all intermediate values to be positive integers (no fractions mid-computation). If your reward function doesn't enforce this but your dataset was generated assuming it, you may get unsolvable problems.
- **LaTeX/Unicode operators.** Models sometimes output `×` (U+00D7) instead of `*`, or `÷` instead of `/`. The evaluator must normalize these.
- **Require-all-numbers ambiguity.** Some setups require using ALL available numbers; others only require reaching the target. This changes task difficulty significantly — be explicit about which you're using.

## Running It

### Requirements

- **No Docker, no sandbox, no external tools.** Pure text-in, text-out.
- **Single turn.** Not agentic, not multi-turn.
- **Evaluation is programmatic** — not LLM-as-judge. The reward function is a deterministic Python function.
- **Fast:** Evaluation is near-instant. The bottleneck is always inference, never scoring.

### Recommended Setup

**For RL training (GRPO/PPO):**
- Use verl or TRL with a custom reward function
- TinyZero reference: `verl/utils/reward_score/countdown.py`
- Swift (ModelScope): built-in support via `--reward_funcs format countdown_reward`
- Dataset: `Jiayi-Pan/Countdown-Tasks-3to4` or generate custom via TinyZero's preprocessing script

**For standalone evaluation:**
- Our package: `packages/custom_evaluations/custom_evaluations/sources/countdown/countdown_judge.py`
- `CountdownJudge.validate_countdown_solution(answer_block, available_numbers, target)`
- Supports both single-expression and step-by-step modes
- Handles LaTeX/Unicode operator normalization
- Uses safe AST-based evaluation (no `eval()`)

**For quick testing:** Generate a small dataset inline — random target + random numbers. No download needed.

### Prompt / Few-Shot Format

**Preferred evaluation prompt (0-shot with CoT + in-context examples):**
```
Answer the following problem. Explain your reasoning step by step. When you are finished, give your answer in this format: <answer>(your answer)</answer>.

# Problem
Using the numbers in the list [{numbers}], create an equation that equals {target}. You can use basic arithmetic operations (+, -, *, /) and each number can only be used once. Your solution should include a series of steps "Step X:" where each step is a mathematical operation and the final step ultimately leads to the target number or it should be a single equation that results in the target.

Give your answer in the following format:
<answer>
(your answer)
</answer>

Where "(your answer)" is the list of steps to reach the target number or it should be a single equation that results in the target.

For example:
If the list of numbers was [1, 2, 3] and the target was 1, you could write:
<answer>
Step 1: 1 + 2 = 3
Step 2: 3 / 3 = 1
</answer>

or

<answer>
(1 + 2) / 3
</answer>

Let's think step by step.
```

This prompt is used by the SkillFactory EVAL datasets (e.g., [SkillFactory/EVAL-cd3args-Qwen2.5-1.5B-Instruct](https://huggingface.co/datasets/SkillFactory/EVAL-cd3args-Qwen2.5-1.5B-Instruct)) and works well for both instruct models and base models with chat templates applied. Key features: explicit CoT elicitation, in-context format examples showing both step-by-step and single-expression answers, `<answer>` tag extraction.

**Alternate prompt (TinyZero-style, for RL training with `<think>` tags):**
```
Using the numbers [{numbers}], create an equation that equals {target}.
You can use basic arithmetic operations (+, -, *, /) and each number can only be used once.
Show your work in <think> </think> tags. Give your final equation in <answer> </answer> tags.
```

This simpler variant is used when training with GRPO/PPO where the model learns reasoning structure through the reward signal rather than prompt instruction. The `<think>` tags give the format reward a second signal to train on.

**Few-shot:** Not typically used in RL training (model learns from reward signal). For inference evaluation, 0-shot with the preferred prompt above is standard. The in-context examples in the prompt itself serve a similar role to few-shot without consuming separate example slots.

## Typical Results

Results vary heavily with number of operands and target range. These are rough baselines for the common TinyZero-like 3-4 operand setting:

| Model | Config | Score | Source |
|-------|--------|-------|--------|
| Qwen2.5-0.5B (post-GRPO) | 3-4 nums, targets 10-99 | ~0.3-0.4 | TinyZero (fails to learn well at 0.5B) |
| Qwen2.5-3B (post-GRPO) | 3-4 nums, targets 10-99 | ~0.7-0.8 | TinyZero |
| Qwen2.5-3B (post-GRPO + curriculum) | 3-4 nums, targets 10-99 | ~0.51 | Stanford CS224R report |
| Qwen2.5-3B (test-time compute) | 3-4 nums, targets 10-99 | ~0.93 | Stanford CS224R report |

## Generating Custom Examples

You can generate Countdown datasets at any $N$ and target range. There are two main approaches:

### Approach 1: Forward generation (fast, any $N$)

Generate the expression first, then derive the problem from it. This is the approach used by `CountdownSource` in `packages/custom_evaluations/`:

1. Pick $N$ random integers from your desired range (e.g., 1-100).
2. Pick $N-1$ random operators from $\{+, -, \times, \div\}$.
3. Evaluate the expression left-to-right to get a target.
4. If the target falls in your desired range and all intermediate results are valid (positive integers, division is exact), keep it. Otherwise, discard and retry.
5. For division: you may need to adjust the divisor to be a factor of the running total so the result stays integer. The `CountdownSource._fix_divisions_for_integers()` method does this automatically.

**Pros:** Works for arbitrarily large $N$ (including $N=12$). Generation is fast since you're not solving anything.
**Cons:** The generated problems are always solvable by left-to-right evaluation, which means the solution structure is simple. Models won't need parenthesization or creative reordering.

**Code:** `packages/custom_evaluations/custom_evaluations/sources/countdown/countdown_source.py` — call `CountdownSource(seed=42).generate_examples(num_examples=1000, min_numbers=12, max_numbers=12, min_value=1, max_value=100, min_target=100, max_target=999)`.

### Approach 2: Backward generation with solver (harder problems, $N \leq 6$-ish)

Generate random numbers + random target, then solve to verify solvability. This is the approach used in `algorithmic_sft/tasks/countdown.py` (SemanticKnowledgeEnhancedGRPO):

1. Pick $N$ numbers from a pool (TV-show style: small numbers 1-10 each available twice, plus 25, 50, 75, 100).
2. Pick a random target in range.
3. Run a BFS or DFS solver over all possible pairwise combinations of numbers and operations to find a valid solution.
4. If a solution exists with at least `min_ops` steps, keep it. Otherwise, discard and retry.

**Pros:** Problems require genuine search — solutions may need parenthesization, non-obvious orderings. These are "real" Countdown problems.
**Cons:** The solver is exponential in $N$ (it explores all pairs at each step). Practical limit is $N \leq 6$-ish before generation becomes very slow. At $N=12$ this approach is infeasible.

**Code:** `research_projects/SemanticKnowledgeEnhancedGRPO/algorithmic_sft/tasks/countdown.py` — the `_generate_solvable(count, target_lo, target_hi, rng)` function.

### Approach 3: Hybrid for large $N$

For $N=12$ or higher where you still want non-trivial problems:

1. Generate a solvable sub-problem at $N=4$ or $N=5$ using the backward solver (Approach 2).
2. Pad the number list with additional random "distractor" numbers up to your desired $N$.
3. The problem is solvable (using the subset), but the model must figure out which numbers to use and which to ignore.
4. Set `require_all_numbers=False` in your evaluator, since the distractors aren't part of the solution.

This gives you hard problems at any $N$ without an exponential solver.

### Quick inline generation (no dependencies)

For a quick test dataset with no package imports:

```python
import random
random.seed(42)
examples = []
for _ in range(1000):
    nums = [random.randint(1, 100) for _ in range(N)]
    ops = [random.choice(['+', '-', '*']) for _ in range(N - 1)]  # skip / for simplicity
    result = nums[0]
    for i, op in enumerate(ops):
        if op == '+': result += nums[i+1]
        elif op == '-': result -= nums[i+1]
        elif op == '*': result *= nums[i+1]
    if 1 <= result <= 9999:
        examples.append({"nums": nums, "target": result})
```

This is the simplest possible approach — no solvability check needed (it's solvable by construction). Good for canary runs and sanity checks.

## Setup Checklists

### For Evaluation

- **Which prompt template?** Preferred is the CoT + in-context examples prompt (see Prompt section). For RL-trained models that learned `<think>` tags, the TinyZero-style prompt may be more appropriate. Match the prompt to how the model was trained.
- **All numbers or subset?** Does your evaluation require the model to use ALL available numbers, or just reach the target with any subset? This drastically changes difficulty and must match how problems were generated.
- **Expression format:** Do you expect a single equation (`(5 + 3) * 2 = 16`) or step-by-step (`Step 1: 5 + 3 = 8, Step 2: 8 * 2 = 16`)? Our `CountdownJudge` handles both, but your answer extraction must match.
- **Answer extraction:** What tags wrap the answer? `<answer>...</answer>` is standard. Are you using `PhraseExtractor` or regex? Does it handle multi-line answers?
- **Operator normalization:** Are you handling Unicode/LaTeX operators (`×`, `÷`, `\times`) or only ASCII (`*`, `/`)?
- **Integer-only intermediates?** Does your evaluator enforce that all intermediate results are positive integers (division must be exact), or allow floats?
- **Tolerance:** What floating-point tolerance are you using? Standard is $10^{-5}$, but some use $10^{-9}$.
- **Number validation method:** Are you using `Counter` (multiset) comparison or `set`? `set` is wrong — it won't catch duplicate number abuse.
- **Which evaluator?** Our `CountdownJudge` (AST-based, safe) or TinyZero-style `eval()` (fast but risky)? For experiments, use ours.

### For Distillation / Data Generation

- **How many operands ($N$)?** This is the single biggest difficulty knob. $N=3$-$4$ is standard, $N=6$+ is hard.
- **Target range?** Standard: 10-99 (easy) or 100-999 (hard). Larger ranges mean more unsolvable problems in backward generation.
- **Generation method?** Forward (expression-first, always solvable, simple structure) vs backward (solver-verified, harder, limited $N$) vs hybrid (solver subset + distractors)?
- **Number pool:** Random from a range (e.g., 1-100) or TV-show style (1-10 twice + 25/50/75/100)?
- **Trace format:** What style of reasoning trace do you want? BFS (level-by-level), DFS (depth-first with backtracking), greedy (closest-first)? Different trace styles teach different reasoning patterns.
- **Require solvability verification?** Forward generation guarantees solvability. Backward requires running the solver. Are you filtering unsolvable problems or including them as "hard negatives"?
- **Deduplication:** Same numbers + same target can appear more than once if you're generating randomly. Are you deduplicating by `(sorted(nums), target)`?
- **Division handling:** Skip division entirely (simpler) or include it with integer-result enforcement? Division creates much harder problems.

### For RL Training

- **Reward function: equation eval or string match?** Must be equation evaluation. String match is wrong — see Known Pitfalls.
- **Which prompt template?** The TinyZero-style `<think>`/`<answer>` prompt lets you train a format reward on both tags. The preferred CoT prompt uses only `<answer>` tags (no explicit `<think>`). If using format reward on reasoning structure, you need the `<think>` variant.
- **Format reward?** Do you give partial credit for correctly formatted but wrong answers (e.g., 0.1 for parseable `<answer>` tags)? TinyZero does. This helps early training when the model can't solve problems yet but can learn the format.
- **Reward scale:** Binary (0/1)? With format bonus (0/0.1/1.0)? Continuous partial credit for "close" answers?
- **All numbers or subset?** Must match your dataset. If the dataset was generated forward (all numbers used), requiring all numbers in the reward is appropriate. If problems have distractors, set `require_all_numbers=False`.
- **What $N$ to train on?** Start small ($N=3$-$4$), verify the model learns, then scale up. Don't burn compute on $N=6$ before confirming the reward function works at $N=3$.
- **Max generation length?** Models need room to think. 2048-4096 tokens minimum for reasoning + answer. For thinking models, 8192+.
- **Rollout count?** TinyZero uses group_size=8-16 for GRPO. More rollouts = better advantage estimation but more compute.
- **Do you need curriculum?** Starting with easy problems ($N=2$-$3$, small targets) and scaling up can improve learning, but adds complexity.
- **Safe eval in reward?** If the reward function uses Python `eval()`, a model could craft adversarial expressions. Use AST-based evaluation for safety, especially at scale.

## Notes

- **Why Countdown for RL?** It's the simplest task with a fully verifiable, non-gameable reward. No LLM judge needed. The search space is small enough for small models to learn but rich enough to see emergent reasoning.
- **"Aha moment":** TinyZero demonstrated that base LMs trained with GRPO on Countdown develop self-verification behavior ("let me check...") without any supervised examples of this behavior. This is the "aha moment" from DeepSeek R1-Zero.
- **Dataset contamination:** Not a significant concern since problems are randomly generated. However, specific dataset splits can leak if the same HF dataset is used for training and evaluation.
- **Scaling to harder settings:** With $N=6$ and targets up to 1000, even large models struggle. The paper "How Does RL Induce Skill Composition?" (ICLR 2025) studies out-of-distribution generalization to larger $N$ and unseen expression tree shapes.
- **Our implementations:** `packages/custom_evaluations/` has `CountdownJudge` with robust evaluation (AST-based, Unicode-aware, step-mode support). Used in world-model-curiosity and SemanticKnowledgeEnhancedGRPO experiments.
