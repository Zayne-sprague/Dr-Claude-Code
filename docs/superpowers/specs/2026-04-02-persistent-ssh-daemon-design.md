# Persistent SSH Daemon Support for RACA CLI

**Date:** 2026-04-02
**Status:** Approved
**Scope:** `tools/cli/raca/`

## Problem

Some HPC clusters (e.g., TACC Vista) don't support SSH ControlMaster session multiplexing. When `raca auth` attempts to connect with ControlMaster options, the SSH process hangs indefinitely after authentication. RACA currently only supports ControlMaster, making these clusters unusable.

## Solution

Add a dual connection strategy to RACA: ControlMaster (preferred) and persistent SSH daemon (fallback). Auto-detect the correct mode during a one-time `raca setup-cluster` probe. Subsequent `raca auth` calls use the saved mode directly.

## Config Model

New field `connection_mode` in `.raca/clusters.yaml`, auto-detected by `raca setup-cluster`:

```yaml
clusters:
  torch:
    host: login.torch.hpc.nyu.edu
    user: zrs2020
    connection_mode: controlmaster   # auto-detected
    vpn_required: true
    uses_2fa: true
  vista:
    host: login1.vista.tacc.utexas.edu
    user: zaynesprague
    connection_mode: persistent      # auto-detected
    vpn_required: false
```

- **Not user-facing** — written automatically by `raca setup-cluster` after probing.
- **Values:** `controlmaster` | `persistent`
- **If missing:** `raca auth` errors with "Run `raca setup-cluster <name>` first."

## Command Flow

### `raca setup-cluster <name>` (new command, one-time per cluster)

1. Read cluster config from `clusters.yaml` (must already exist via `raca cluster add` or the setup-cluster skill).
2. VPN check if `vpn_required`.
3. **Phase 1 — Try ControlMaster:**
   - Spawn SSH via pexpect WITH ControlMaster options (`-o ControlMaster=auto -o ControlPath=<path> -o ControlPersist=4h`).
   - Proxy interactive auth to user's terminal (password, 2FA, DUO, etc.).
   - After auth activity stops (no new output for ~3s), print:
     `"Authenticated. Testing connection mode -- this may take up to 2 minutes..."`
   - Wait up to **2 minutes** for a shell prompt.
   - **If prompt detected:** ControlMaster works.
     - Clean up pexpect (ControlPersist keeps socket alive).
     - Save `connection_mode: controlmaster` to `clusters.yaml`.
     - Print: `"Connection mode: controlmaster (session multiplexing supported)"`
     - Print: `"Run 'raca auth <name>' from now on to reconnect."`
   - **If timeout (2 min):** ControlMaster broken.
     - Kill the SSH process.
     - Print: `"This cluster doesn't support session multiplexing. Switching to persistent mode -- please authenticate again."`
4. **Phase 2 — Try persistent (only if Phase 1 failed):**
   - Spawn SSH via pexpect WITHOUT ControlMaster options (plain `ssh -tt`).
   - Proxy interactive auth again.
   - Wait for shell prompt (2 min timeout).
   - **If prompt detected:** Daemonize (double-fork).
     - Save `connection_mode: persistent` to `clusters.yaml`.
     - Print: `"Connection mode: persistent (daemon session)"`
     - Print: `"Run 'raca auth <name>' from now on to reconnect."`
   - **If timeout:** Both modes failed. Print error with debug hints.

### `raca auth <name>` (subsequent reconnects)

1. Read `connection_mode` from config.
2. **If not set:** Error: `"Cluster '<name>' hasn't been set up yet. Run: raca setup-cluster <name>"`
3. **If `controlmaster`:** Current ControlMaster flow (unchanged).
4. **If `persistent`:** Pexpect auth + daemonize.

### `raca auth --status` (unchanged)

Shows all clusters with connection state. Persistent clusters show "connected (persistent session)" or "disconnected".

## SSHSessionManager Dispatch

`controlmaster.py` gains dual dispatch on `connection_mode`:

### `is_connected(cluster)`
- `controlmaster` → socket file exists + `ssh -O check`
- `persistent` → PID file exists + process alive + `__PING__` over Unix socket

### `health_check(cluster)`
- `controlmaster` → `ssh -O check` with 5s timeout (current behavior: timeout = busy, non-zero = dead)
- `persistent` → `is_daemon_running()` + `send_command("__PING__")`. If PING returns `"alive"` → healthy. If `"dead"` → stop daemon, report unhealthy. If timeout/error → assume busy (don't kill).

### `connect(cluster)`
- Reads `connection_mode` from config, routes to appropriate strategy.
- `controlmaster` → current subprocess-based flow.
- `persistent` → pexpect spawn + interactive auth + daemonize.

### `run(cluster, command, timeout)`
- `controlmaster` → SSH slave connection via subprocess (current behavior).
- `persistent` → `send_command(socket_path, command, timeout)` over Unix domain socket. Returns `RemoteResult`.

### `disconnect(cluster)`
- `controlmaster` → `ssh -O exit` + socket cleanup (current).
- `persistent` → `stop_daemon()`: graceful `__SHUTDOWN__` over socket, fallback SIGTERM, cleanup PID/socket files.

### `upload(cluster, ...)` / `download(cluster, ...)` / `forward(cluster, ...)`
- **ControlMaster only.** If `connection_mode` is `persistent`, raise with clear message:
  `"Upload/download not supported for persistent-mode clusters. Use: raca ssh <cluster> 'scp ...' instead"`

## New File: `raca/persistent.py`

Ported from `experiment-runner/experiment_runner/ssh/persistent.py`, adapted for RACA.

### `PersistentSSHDaemon` class

Manages a persistent interactive SSH session as a background daemon.

**`__init__(cluster_config: dict)`** — takes cluster config dict from `clusters.yaml`.

**`start(timeout: int = 120) -> bool`** — spawn SSH via pexpect, proxy interactive auth, detect shell prompt, double-fork daemon.

**`_interactive_auth(timeout: int) -> bool`** — raw terminal mode, `select()` loop shuttling bytes between SSH child and stdin/stdout. Detects shell prompt via regex patterns:
- `[$%#>]\s*$`
- `)\$\s*$`
- `]\$\s*$`, `]%\s*$`, `]#\s*$`

Returns `True` when prompt detected.

**`_fork_daemon() -> bool`** — double-fork daemonize:
- First fork → setsid → second fork.
- Grandchild: redirect stdio to /dev/null (protect PTY fd), write PID file, install SIGTERM/SIGHUP cleanup handlers, run socket server.
- Parent: wait up to 5s for PID file, detach pexpect references to prevent GC from killing SSH.

**`_run_socket_server(socket_path)`** — Unix domain socket server loop:
- Binds to `~/.ssh/sockets/<cluster>-session.sock`.
- Accepts JSON-line requests, dispatches to `_execute_command()`.
- Special commands: `__PING__` (health check), `__SHUTDOWN__` (graceful exit).
- Periodic SSH health check (every accept timeout cycle).
- Heartbeat every 30s (sends ` true\n` to PTY to prevent HPC idle-session killers).

**`_execute_command(command, timeout) -> dict`** — sentinel-based command execution:
- Wraps command in `__RACA_START_<uid>` / `__RACA_END_<uid>_RC_<code>` markers.
- Suppresses echo + PS1 during command, restores after.
- Reads PTY output via `select()` + `os.read()`, parses output between sentinels.
- Returns `{"stdout": ..., "stderr": ..., "returncode": ..., "duration_s": ...}`.
- Sends heartbeat during long-running commands to prevent idle kill.

### Client functions (module-level)

**`send_command(socket_path, command, timeout) -> dict`** — connect to daemon's Unix socket, send JSON request, read JSON response.

**`is_daemon_running(pid_path, socket_path) -> bool`** — check PID file exists, process alive (`os.kill(pid, 0)`), socket file exists. Cleans up stale files if process is dead.

**`stop_daemon(pid_path, socket_path) -> bool`** — graceful `__SHUTDOWN__` via socket, wait 0.5s, fallback SIGTERM, wait 2s, cleanup files.

### File paths

| File | Path |
|------|------|
| Unix socket | `~/.ssh/sockets/<cluster>-session.sock` |
| PID file | `~/.ssh/sockets/<cluster>-session.pid` |
| Daemon log | `~/.ssh/sockets/<cluster>-daemon.log` |

## New File: `raca/setup_cluster.py`

New Click command registered as `raca setup-cluster`.

**Arguments:** `cluster` (name, must exist in `clusters.yaml`)

**Flow:** Implements the Phase 1 / Phase 2 probe described in Command Flow above.

**Prompt detection:** Uses the same regex patterns as `PersistentSSHDaemon._interactive_auth()`. "Auth activity stopped" means no bytes received from SSH for 3 consecutive seconds AND at least one round of user input was sent (password/token). This distinguishes interactive auth prompts (which have natural pauses while the user types) from the post-auth state. After this 3s silence, the testing message is printed and the 2-minute prompt-detection timer starts.

**ControlMaster probe SSH args:**
```
ssh -tt
  -o ControlMaster=auto
  -o ControlPath=~/.ssh/sockets/<user>@<cluster>
  -o ControlPersist=4h
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=6
  -o StrictHostKeyChecking=accept-new
  user@host
```

**Persistent fallback SSH args:**
```
ssh -tt
  -o StrictHostKeyChecking=accept-new
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=6
  -o LogLevel=ERROR
  -o ForwardAgent=yes
  user@host
```

## Dependencies

`pyproject.toml` adds `pexpect>=4.8`:

```toml
dependencies = [
    "click>=8.0",
    "pyyaml>=6.0",
    "pexpect>=4.8",
]
```

pexpect is pure Python, ~30KB, no C extensions. Uses stdlib `pty` module. Works on macOS and Linux.

## Files Changed

| File | Change |
|------|--------|
| `raca/persistent.py` | **New** — PersistentSSHDaemon + client functions |
| `raca/setup_cluster.py` | **New** — `raca setup-cluster` probe command |
| `raca/controlmaster.py` | **Modified** — dual dispatch in SSHSessionManager |
| `raca/config.py` | **Modified** — helper to read `connection_mode` |
| `raca/auth.py` | **Modified** — persistent mode support in `raca auth` |
| `raca/disconnect.py` | **Modified** — persistent mode disconnect |
| `raca/ssh.py` | **No change** — already uses `manager.run()` which dispatches |
| `raca/upload.py` | **Modified** — error for persistent clusters |
| `raca/download.py` | **Modified** — error for persistent clusters |
| `raca/forward.py` | **Modified** — error for persistent clusters |
| `raca/cli.py` | **Modified** — register `setup-cluster` command |
| `pyproject.toml` | **Modified** — add pexpect dependency |

## What This Does NOT Include

- Upload/download/forward for persistent-mode clusters (future work: standalone rsync transport)
- Auto-probing on `raca auth` (always requires `raca setup-cluster` first)
- Changes to the setup-cluster skill (`.claude/skills/setup-cluster/SKILL.md`) — that's a separate update after the CLI work
