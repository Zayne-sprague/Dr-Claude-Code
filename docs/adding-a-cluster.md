# Adding a Cluster

Cluster details live in `.drcc/clusters.yaml`. Claude reads this file when generating job scripts, SSH commands, and environment setup steps. Add your cluster here once — you never need to specify it again.

## SLURM Cluster

```yaml
clusters:
  mycluster:
    hostname: login.mycluster.edu   # SSH login node
    user: myuser                    # Your username on the cluster
    vpn_required: false             # Set true if cluster is behind VPN
    uses_2fa: true                  # Set true if login requires 2FA (TOTP, Duo, etc.)
    default_partition: gpu          # Partition used when none is specified
    partitions:
      gpu:
        gpus_per_node: 4            # Number of GPUs available per node
        gpu_type: A100              # GPU model (used for memory estimates and job scripts)
        gpu_memory_gb: 80           # Per-GPU memory in GB
        max_nodes: 10               # Maximum nodes you can request
    slurm_account: "mygroup"        # SLURM billing account (--account flag)
    module_loads:                   # Modules to load at job start
      - cuda/12.4
    scratch_path: "$SCRATCH"        # Path for temporary job data and outputs
    conda_path: "$CONDA_PREFIX"     # Path to conda installation
    gpu_directive_format: "--gpus-per-node={count}"  # SLURM GPU directive format
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `hostname` | yes | SSH login node hostname |
| `user` | yes | Your username |
| `vpn_required` | no | Whether to check for VPN before connecting |
| `uses_2fa` | no | Whether 2FA is required (dcc auth handles the prompt) |
| `default_partition` | no | Fallback partition if none is specified |
| `partitions` | yes | Map of partition name → specs |
| `partitions.<name>.gpus_per_node` | yes | GPUs per node on this partition |
| `partitions.<name>.gpu_type` | yes | GPU model name |
| `partitions.<name>.gpu_memory_gb` | yes | Per-GPU memory in GB |
| `partitions.<name>.max_nodes` | no | Node limit for this partition |
| `slurm_account` | no | SLURM account for billing (`--account`) |
| `module_loads` | no | List of modules to load in job scripts |
| `scratch_path` | no | Scratch storage path for job data |
| `conda_path` | no | Conda installation path |
| `gpu_directive_format` | no | SLURM GPU flag format (varies by cluster) |

## RunPod

```yaml
clusters:
  runpod:
    type: runpod
    api_key_env: RUNPOD_API_KEY     # Name of the env var holding your RunPod API key
    default_gpu: H100               # Default GPU type when none is specified
```

RunPod clusters cost money per hour. Claude will always ask before selecting RunPod as the compute target.

## Local GPUs

```yaml
clusters:
  local:
    type: local
    partitions:
      default:
        gpus_per_node: 1
        gpu_type: RTX4090
        gpu_memory_gb: 24
```

Local clusters run jobs directly on your machine. No SSH, no SLURM. Useful for canary runs and debugging before submitting to HPC.

## After Adding a Cluster

Run `dcc auth <cluster-name>` to establish the SSH connection. Claude will verify connectivity and confirm the cluster is reachable before using it.
