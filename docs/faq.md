# FAQ

## `dcc auth` hangs

Two likely causes:

1. **VPN not connected** — if your cluster requires VPN, connect first, then retry.
2. **2FA prompt in terminal** — `dcc auth` may be waiting for a TOTP code or Duo push. Check your terminal for a prompt that's not visually obvious, or check your authenticator app.

## SSH timeout after `dcc auth` succeeded

Stale ControlMaster socket. Run:

```bash
dcc disconnect <cluster>
dcc auth <cluster>
```

This clears the old socket and re-establishes a fresh connection.

## `sbatch: invalid partition`

The partition name in your job script doesn't match what the cluster reports. Check available partitions with:

```bash
dcc ssh <cluster> "sinfo -o '%P %G %l'"
```

Update the partition name in `~/.dcc/clusters.yaml` and regenerate the job script.

## Dashboard not loading

Check the HuggingFace Space build logs:

1. Go to your Space on huggingface.co
2. Click **Settings** → **Build logs**
3. Look for Python import errors or missing dependencies

Common fix: a new dependency was added to the backend but not to `requirements.txt`.

## vLLM OOM when serving a model

The model is too large for the available GPU memory. Options:

- Use a quantized variant (GPTQ or AWQ) — same model, much lower memory
- Request more GPUs: `dcc forward` supports multi-GPU vLLM via tensor parallelism
- Try a smaller model in the same family

Ask Claude: "How much memory does Qwen3-8B need in BF16 vs AWQ?" before submitting.

## How do I update Dr. Claude Code?

Re-run the install script:

```bash
curl -sSL https://raw.githubusercontent.com/Zayne-sprague/Dr-Claude-Code/main/install.sh | bash
```

It's idempotent — safe to run on an existing installation.

## Can I use this without Claude Code?

The `dcc` CLI works standalone for SSH session management. You can use `dcc auth`, `dcc ssh`, `dcc upload`, `dcc download`, and `dcc forward` from any terminal.

The skills, rules, and agents require Claude Code — they're instruction sets that only Claude Code can execute. Without Claude Code, you get the SSH layer but not the research automation.
