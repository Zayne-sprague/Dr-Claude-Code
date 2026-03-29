# Local GPU — Initial Setup

Setting up a local NVIDIA GPU for ML workloads.

---

## 1. NVIDIA Driver Installation

Check if a driver is already installed:

```bash
nvidia-smi
```

If not installed, go to [nvidia.com/drivers](https://www.nvidia.com/Download/index.aspx), select your GPU and OS, and download the `.run` file or use your package manager.

**Ubuntu (recommended):**

```bash
# Detect and install the recommended driver
sudo ubuntu-drivers autoinstall

# Or install a specific version
sudo apt install nvidia-driver-535
sudo reboot
```

**Verify after reboot:**

```bash
nvidia-smi
# Should show GPU name, driver version, CUDA version
```

---

## 2. CUDA Toolkit

The driver ships a CUDA runtime version (visible in `nvidia-smi`). For building CUDA extensions (e.g., flash-attention from source), you also need the CUDA toolkit.

Check what PyTorch needs before installing — PyTorch bundles its own CUDA libraries, so you often don't need the system toolkit unless building custom ops.

**Install CUDA toolkit (Ubuntu):**

```bash
# Example for CUDA 12.1
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt update
sudo apt install cuda-toolkit-12-1
```

Add to `~/.bashrc`:

```bash
export PATH=/usr/local/cuda/bin:$PATH
export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH
```

Verify: `nvcc --version`

---

## 3. Verify GPU is Accessible

```bash
nvidia-smi                          # show GPU stats
nvidia-smi -l 1                     # live refresh every second
watch -n 1 nvidia-smi               # alternative live view

# From Python
python3 -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

---

## 4. Conda Environment Setup

Install Miniconda:

```bash
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh -b -p ~/miniconda3
~/miniconda3/bin/conda init bash
source ~/.bashrc
```

Create a project environment with PyTorch:

```bash
conda create -n myproject python=3.11 -y
conda activate myproject

# Install PyTorch with CUDA (match your CUDA version)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Verify GPU
python -c "import torch; print(torch.cuda.is_available())"
```

---

## 5. Common Issues

**Driver version too old for PyTorch** — PyTorch requires a minimum driver version for each CUDA build. Check the [PyTorch compatibility table](https://pytorch.org/get-started/locally/). Update your driver if needed.

**CUDA version mismatch** — `torch.version.cuda` (the CUDA PyTorch was built with) must be compatible with your driver. The driver supports all CUDA versions up to the one shown in `nvidia-smi`. Mismatches usually surface as `CUDA error: no kernel image is available for execution on the device`.

**GPU not visible** — if `nvidia-smi` works but PyTorch can't see the GPU, check `CUDA_VISIBLE_DEVICES`:

```bash
echo $CUDA_VISIBLE_DEVICES          # should be unset or "0,1,..."
CUDA_VISIBLE_DEVICES=0 python my_script.py
```

**Out of memory (OOM)** — reduce batch size, enable gradient checkpointing, or use mixed precision (`torch.autocast`). Don't reduce `max_tokens` for generation — use gradient accumulation instead.

**Permission denied on `/dev/nvidia*`** — add your user to the `video` group:

```bash
sudo usermod -aG video $USER
# Log out and back in
```

**Multiple GPUs — topology** — check NVLink connectivity:

```bash
nvidia-smi topo -m
```

For multi-GPU training, prefer GPUs connected via NVLink (marked `NV*` in the topology matrix) over PCIe.
