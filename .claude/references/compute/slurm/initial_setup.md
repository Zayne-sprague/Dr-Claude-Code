# SLURM HPC Cluster — Initial Setup

Generic guide for university and institutional HPC clusters running SLURM.

---

## 1. SSH Key Setup

Generate a key pair and copy it to the cluster (do this once):

```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
ssh-copy-id username@cluster.university.edu
```

Test that passwordless login works:

```bash
ssh username@cluster.university.edu "echo ok"
```

### ControlMaster for persistent sessions

Add this to `~/.ssh/config` to reuse a single authenticated connection across all terminal windows. Especially useful when 2FA is involved — authenticate once, reuse all day:

```
Host cluster-alias
    HostName cluster.university.edu
    User username
    ControlMaster auto
    ControlPath ~/.ssh/cm-%r@%h:%p
    ControlPersist 8h
    ServerAliveInterval 60
    ServerAliveCountMax 5
```

After the first `ssh cluster-alias` (which prompts 2FA), all subsequent connections reuse the socket silently.

---

## 2. VPN

Many university HPCs require VPN before SSH is permitted. Common setups:

- **Cisco AnyConnect** — most common; connect before SSH
- **GlobalProtect** — some institutions
- **SSH bastion/jump host** — some clusters use a login node reachable without VPN, then you jump to the compute login node

Check your HPC documentation for the required VPN. If you see `Connection refused` or `Connection timed out` when SSHing, VPN is almost certainly required.

To add a jump host to `~/.ssh/config`:

```
Host cluster-alias
    HostName internal-login.hpc.edu
    User username
    ProxyJump gateway.university.edu
```

---

## 3. Understanding Partitions, QOS, and Accounts

```bash
# List all partitions and their node counts / time limits
sinfo

# List all partitions with GPU info
sinfo -o "%P %G %l %D"

# List your account and QOS associations
sacctmgr show assoc user=$USER format=Account,Partition,QOS

# Check current queue state
squeue -u $USER
```

Key concepts:
- **Partition** — a group of nodes (e.g., `gpu`, `h100`, `l40s`). Each has a time limit and node constraints.
- **Account** — the allocation/group your jobs are billed against. You often need `--account=your_account` in sbatch.
- **QOS** — quality of service class; limits max jobs, GPUs, or walltime per user or group.

Common error: `QOSGrpGRES` — your group has hit the shared GPU quota. Wait for others' jobs to finish or check with your admin.

---

## 4. Storage Paths

Most HPC systems have three tiers:

| Path | Variable | Quota | Use case |
|---|---|---|---|
| `/home/username/` | `$HOME` | Small (10–50 GB) | Code, configs, scripts |
| `/scratch/username/` | `$SCRATCH` | Large (1–10 TB), purged | Datasets, checkpoints, outputs |
| `/work/username/` | `$WORK` | Medium, not purged | Long-lived data |

Always use `$SCRATCH` for large model weights and datasets. Check your quota:

```bash
quota -s
# or
df -h $HOME $SCRATCH
```

---

## 5. Module System

HPC systems use `module` to manage software environments:

```bash
module avail               # list all available modules
module avail cuda          # filter by name
module load cuda/12.1      # load a module
module list                # show currently loaded modules
module purge               # unload all
```

Add `module load` commands to your `.bashrc` or sbatch scripts as needed.

---

## 6. Conda on Clusters

Install Miniconda to `$SCRATCH` or `$HOME` (not a shared path):

```bash
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh -b -p $HOME/miniconda3
$HOME/miniconda3/bin/conda init bash
source ~/.bashrc
```

Create a project environment:

```bash
conda create -n myproject python=3.11 -y
conda activate myproject
pip install -r requirements.txt
```

Each project should have its own environment. Never install research packages into `base`.

---

## 7. Common Gotchas

**Idle-kill policy** — login nodes kill processes that run too long or use too much CPU. Never run training or heavy preprocessing on the login node. Use `srun --pty bash` for interactive compute access, or submit via sbatch.

**GPU time limits** — most partitions cap walltime (e.g., 24h, 48h, 72h). Design jobs to be resumable from checkpoints. Prefer 4–8h jobs over marathon runs.

**GPU quotas** — shared allocations (`QOSGrpGRES`) mean your group competes for GPUs. Check the queue before submitting large arrays.

**CUDA version mismatch** — the CUDA toolkit module version must match what your PyTorch was built against. Check with `python -c "import torch; print(torch.version.cuda)"` and compare to `nvcc --version`.

**File descriptor limits** — large DataLoader workers can exhaust file descriptors. Add `ulimit -n 65536` to your sbatch script if you hit `OSError: [Errno 24] Too many open files`.

**Home quota fills silently** — pip caches, conda packages, and `.cache/huggingface` can fill `$HOME` overnight. Point caches to scratch:

```bash
export PIP_CACHE_DIR=$SCRATCH/.pip-cache
export HF_HOME=$SCRATCH/.cache/huggingface
```
