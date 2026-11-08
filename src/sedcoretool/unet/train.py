"""Training a U-Net on a prepared dataset and exporting it for the app (V0.15).

Requires the optional dependencies (``pip install 'sedcoretool[unet]'``): PyTorch, segmentation-models-pytorch,
onnx. A consumer GPU (e.g. 8–12 GB) is enough; CPU works for tests and very small sets.

Choices (documented in docs/TECHNICAL_DOCUMENTATION.md):
* U-Net with a ResNet-34 encoder pre-trained on ImageNet (or random weights with ``encoder_weights=None``);
* loss = cross-entropy (binary: BCE with logits) + soft Dice, both ignoring pixels labelled 255;
* augmentation: horizontal and vertical flips and photometric jitter (brightness, contrast, gamma).
  No 90° rotations: trace orientation relative to bedding is diagnostic;
* AdamW, cosine learning-rate schedule, early stopping on the validation Dice;
* export: ONNX (opset 17, input ``image`` 1×3×T×T, output ``logits`` 1×C×T×T) and the JSON read by the app.
"""

from __future__ import annotations

import gc
import json
import random
import warnings
from pathlib import Path
from uuid import uuid4

import numpy as np
from PIL import Image

from .tiling import IGNORE, UnetConfig

_MIN_GPU_BYTES = 256 * 1024**2
_GPU_FAILURES = (
    "out of memory",
    "cuda error: memory allocation",
    "cublas_status_alloc_failed",
    "cudnn_status_alloc_failed",
    "cuda-capable device is busy or unavailable",
    "cuda error: initialization error",
    "cuda driver initialization failed",
    "cuda driver version is insufficient",
    "not currently implemented for the mps device",
    "not implemented for mps",
)


def _torch():
    try:
        import segmentation_models_pytorch as smp
        import torch
    except ImportError as e:  # pragma: no cover - optional dependency
        raise ImportError("install the optional dependencies: pip install 'sedcoretool[unet]'") from e
    return torch, smp


def augment(img: np.ndarray, mask: np.ndarray, rng: random.Random):
    """Flips and photometric jitter on a uint8 tile; returns float image in [0, 1] and the mask."""
    if rng.random() < 0.5:
        img, mask = img[:, ::-1], mask[:, ::-1]
    if rng.random() < 0.5:
        img, mask = img[::-1], mask[::-1]
    x = img.astype(np.float32) / 255.0
    x = np.clip((x - 0.5) * rng.uniform(0.85, 1.15) + 0.5 + rng.uniform(-0.08, 0.08), 0, 1) ** rng.uniform(0.8, 1.25)
    return np.ascontiguousarray(x), np.ascontiguousarray(mask)


def _loader(folder: Path, cfg: UnetConfig, train: bool, batch: int, seed: int):
    torch, _ = _torch()
    files = sorted((folder / "images").glob("*.png"))
    mean, std = np.asarray(cfg.mean, np.float32), np.asarray(cfg.std, np.float32)

    class DS(torch.utils.data.Dataset):
        def __init__(self):
            self.rng = random.Random(seed)

        def __len__(self):
            return len(files)

        def __getitem__(self, i):
            img = np.asarray(Image.open(files[i]).convert("RGB"))
            m = np.asarray(Image.open(folder / "masks" / files[i].name))
            x, m = augment(img, m, self.rng) if train else (img.astype(np.float32) / 255.0, m)
            x = ((x - mean) / std).transpose(2, 0, 1)
            return torch.from_numpy(np.ascontiguousarray(x, np.float32)), torch.from_numpy(m.astype(np.int64))

    return torch.utils.data.DataLoader(DS(), batch_size=batch, shuffle=train, num_workers=0, drop_last=False)


def _loss(logits, y, n_cls):
    torch, _ = _torch()
    F = torch.nn.functional
    valid = (y != IGNORE).float()
    yv = torch.where(y == IGNORE, torch.zeros_like(y), y)
    if n_cls == 1:
        t = (yv > 0).float()
        ce = (F.binary_cross_entropy_with_logits(logits[:, 0], t, reduction="none") * valid).sum() / valid.sum().clamp(min=1)
        p = torch.sigmoid(logits[:, 0]) * valid
        dice = 1 - (2 * (p * t).sum() + 1) / (p.sum() + (t * valid).sum() + 1)
    else:
        ce = F.cross_entropy(logits, y, ignore_index=IGNORE)
        p = torch.softmax(logits, 1) * valid[:, None]
        oh = F.one_hot(yv, n_cls).permute(0, 3, 1, 2).float() * valid[:, None]
        dice = 1 - ((2 * (p * oh).sum((0, 2, 3)) + 1) / (p.sum((0, 2, 3)) + oh.sum((0, 2, 3)) + 1))[1:].mean()
    return ce + dice


def _dice(logits, y, n_cls):
    """Pixel Dice of bioturbation (any class > 0) over valid pixels: (2TP, FP+FN)."""
    pred = (logits[:, 0] > 0) if n_cls == 1 else (logits.argmax(1) > 0)
    valid, t = y != IGNORE, (y > 0) & (y != IGNORE)
    p = pred & valid
    return int((p & t).sum()) * 2, int((p & ~t).sum() + (~p & t).sum())


def train(data: str | Path, out: str | Path, encoder: str = "resnet34", encoder_weights: str | None = "imagenet",
          epochs: int = 60, batch: int = 8, lr: float = 3e-4, patience: int = 12, seed: int = 42,
          device: str | None = None, log=print, progress=None, resume: bool = False, *, cpu_only: bool = False) -> dict:
    """Train on ``data`` (written by ``prepare_dataset``); write ``out.onnx`` and ``out.json``; return the summary.

    ``progress(dict)`` is called after every epoch (epoch, epochs, loss, val_dice, best, best_epoch).
    A checkpoint ``out.ckpt`` is written after every epoch; ``resume=True`` continues from it.
    A CUDA/MPS memory failure retries on CPU. ``cpu_only`` skips GPU probing.
    """
    torch, smp = _torch()
    data, out = Path(data), Path(out).with_suffix("")
    out.parent.mkdir(parents=True, exist_ok=True)
    info = json.loads((data / "dataset.json").read_text(encoding="utf-8"))
    n_cls = 1 if info["binary"] else len(info["classes"]) + 1
    cfg = UnetConfig(tile=info["tile"], overlap=info["overlap"], px_per_cm=info["pxPerCm"], classes=info["classes"])
    min_memory = max(_MIN_GPU_BYTES, batch * cfg.tile**2 * (3 * 4 + 8))
    selected = _select_device(torch, device, min_memory, cpu_only)
    ckpt = out.with_suffix(".ckpt")

    def save_epoch(state, best_path, improved):
        nonlocal resume
        pending = best_path.with_name(f".{best_path.name}.{uuid4().hex}.tmp") if improved else None
        try:
            if pending:
                torch.save(state["model"], pending)
                state["pending_best"] = pending.name
            _save_checkpoint(torch, state, ckpt)
        except BaseException:
            if pending:
                pending.unlink(missing_ok=True)
            raise
        resume = True
        if pending:
            pending.replace(best_path)

    options = (torch, smp, data, out, info, cfg, n_cls, encoder, encoder_weights, epochs, batch, lr, patience, seed, log, progress)

    def attempt(target, *, log_resume=True):
        # Notebook users may have set a global default device. Place implicit allocations on CPU.
        with torch.device("cpu"):
            return _train_on_device(*options, target, resume, save_epoch, log_resume=log_resume)

    try:
        return attempt(selected)
    except RuntimeError as exc:
        if selected.split(":")[0] not in {"cuda", "mps"} or not _is_gpu_failure(torch, exc):
            raise
    # Leave the handler before retrying so the exception traceback releases GPU tensors.
    _release_device(torch, selected)
    return attempt("cpu", log_resume=False)


def _save_checkpoint(torch, state, path):
    tmp = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    try:
        torch.save(state, tmp)
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


def _train_on_device(torch, smp, data, out, info, cfg, n_cls, encoder, encoder_weights, epochs, batch,
                     lr, patience, seed, log, progress, device, resume, save_epoch, *, log_resume):
    random.seed(seed)
    np.random.seed(seed)
    torch.random.default_generator.manual_seed(seed)
    if device.split(":")[0] == "cuda":
        torch.cuda.manual_seed_all(seed)
    elif device.split(":")[0] == "mps" and hasattr(torch.mps, "manual_seed"):
        torch.mps.manual_seed(seed)
    model = smp.Unet(encoder, encoder_weights=encoder_weights, in_channels=3, classes=n_cls).to(device)
    tr = _loader(data / "train", cfg, True, batch, seed)
    has_val = any((data / "val" / "images").glob("*.png"))
    va = _loader(data / ("val" if has_val else "train"), cfg, False, batch, seed)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(1, epochs))
    best, best_ep, history, wait, start = -1.0, 0, [], 0, 1
    ckpt, best_path = out.with_suffix(".ckpt"), out.with_suffix(".pt")
    if resume and ckpt.exists():
        # Load the checkpoint in host RAM before copying state into the model and optimiser.
        c = torch.load(ckpt, map_location="cpu", weights_only=False)
        pending = c.get("pending_best")
        if pending and pending == Path(pending).name and pending.startswith(f".{best_path.name}."):
            saved_best = best_path.with_name(pending)
            if saved_best.exists():
                saved_best.replace(best_path)
        model.load_state_dict(c["model"]), opt.load_state_dict(c["opt"]), sched.load_state_dict(c["sched"])
        best, best_ep, history, wait, start = c["best"], c["best_ep"], c["history"], c["wait"], c["epoch"] + 1
        if log_resume:
            log(f"resuming after epoch {c['epoch']}")
        del c
    stopped = wait >= patience
    for ep in range(start, epochs + 1):
        if stopped:
            break
        model.train()
        tot = 0.0
        for x, y in tr:
            x, y = x.to(device), y.to(device)
            opt.zero_grad()
            loss = _loss(model(x), y, n_cls)
            loss.backward()
            opt.step()
            tot += float(loss) * len(x)
        sched.step()
        model.eval()
        a = b = 0
        with torch.no_grad():
            for x, y in va:
                da, db = _dice(model(x.to(device)), y.to(device), n_cls)
                a, b = a + da, b + db
        d = a / (a + b) if a + b else 0.0
        history.append({"epoch": ep, "loss": tot / max(1, len(tr.dataset)), "val_dice": d})
        log(f"epoch {ep}: loss {history[-1]['loss']:.4f}  val Dice {d:.4f}")
        improved = d > best
        if improved:
            best, best_ep, wait = d, ep, 0
        else:
            wait += 1
            stopped = wait >= patience
        save_epoch({"model": model.state_dict(), "opt": opt.state_dict(), "sched": sched.state_dict(), "epoch": ep,
                    "best": best, "best_ep": best_ep, "history": history, "wait": wait}, best_path, improved)
        if progress:
            progress({"epoch": ep, "epochs": epochs, "loss": history[-1]["loss"], "val_dice": d, "best": best,
                      "best_epoch": best_ep, "device": device})
    model = model.cpu()
    model.load_state_dict(torch.load(best_path, map_location="cpu"))
    export_onnx(model.eval(), cfg.tile, out.with_suffix(".onnx"))
    summary = {**cfg.to_json(), "encoder": encoder, "encoderWeights": encoder_weights, "bestEpoch": best_ep,
               "valDice": best, "validatedOn": "val" if has_val else "train (no validation cores)",
               "split": info["split"], "seed": seed, "history": history}
    out.with_suffix(".json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def _select_device(torch, device, min_memory: int, cpu_only: bool) -> str:
    if cpu_only:
        return "cpu"
    requested = str(device) if device else None
    kind = requested.split(":")[0] if requested is not None else None
    if requested is not None and kind not in {"cuda", "mps"}:
        return requested
    try:
        if kind in {None, "cuda"}:
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", message=r"CUDA initialization:.*", category=UserWarning)
                if torch.cuda.is_available():
                    target = requested or "cuda"
                    free, _ = torch.cuda.mem_get_info(target)
                    return target if free >= min_memory else "cpu"
        mps = getattr(torch.backends, "mps", None)
        if kind in {None, "mps"} and mps is not None and mps.is_available():
            free = torch.mps.recommended_max_memory() - torch.mps.driver_allocated_memory()
            return (requested or "mps") if free >= min_memory else "cpu"
    except (RuntimeError, OSError, AttributeError, AssertionError):
        # Older runtimes may expose the accelerator without a working memory probe.
        pass
    return "cpu"


def _is_gpu_failure(torch, exc: RuntimeError) -> bool:
    oom = getattr(torch, "OutOfMemoryError", getattr(torch.cuda, "OutOfMemoryError", None))
    message = str(exc).lower()
    if "cpuallocator" in message:
        return False
    return (oom is not None and isinstance(exc, oom)) or any(fragment in message for fragment in _GPU_FAILURES)


def _release_device(torch, device: str) -> None:
    gc.collect()
    try:
        if device.split(":")[0] == "cuda":
            torch.cuda.empty_cache()
        else:
            torch.mps.empty_cache()
    except (RuntimeError, OSError, AttributeError, AssertionError):
        pass


def best_device(*, cpu_only: bool = False) -> str:
    """CUDA or MPS with verified headroom, or CPU."""
    torch, _ = _torch()
    return _select_device(torch, None, _MIN_GPU_BYTES, cpu_only)


def device_info(*, cpu_only: bool = False) -> dict:
    """Training hardware seen by PyTorch (for the app's training dialog)."""
    torch, _ = _torch()
    d = _select_device(torch, None, _MIN_GPU_BYTES, cpu_only)
    try:
        name = torch.cuda.get_device_name() if d == "cuda" else ("Apple GPU (MPS)" if d == "mps" else "CPU")
    except (RuntimeError, OSError, AttributeError, AssertionError):
        d, name = "cpu", "CPU"
    return {"device": d, "name": name, "torch": torch.__version__}


def export_onnx(model, tile: int, path: str | Path) -> Path:
    torch, _ = _torch()
    x = torch.zeros(1, 3, tile, tile, device="cpu")
    kw = dict(input_names=["image"], output_names=["logits"], opset_version=17,
              dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}})
    try:
        torch.onnx.export(model, x, str(path), dynamo=False, **kw)
    except TypeError:  # PyTorch < 2.5 has no `dynamo` argument
        torch.onnx.export(model, x, str(path), **kw)
    return Path(path)
