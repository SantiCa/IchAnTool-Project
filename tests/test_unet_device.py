import json
import sys
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import Mock

import numpy as np
import pytest

from sedcoretool.cli import build_parser
from sedcoretool.segmentation import mask_from_unet
from sedcoretool.unet import train as training
from sedcoretool.unet.predict import OnnxUnet


def fake_torch():
    return SimpleNamespace(
        __version__="test",
        cuda=SimpleNamespace(
            is_available=Mock(return_value=True),
            mem_get_info=Mock(return_value=(2**30, 2**31)),
            empty_cache=Mock(),
            get_device_name=Mock(return_value="NVIDIA"),
        ),
        backends=SimpleNamespace(mps=SimpleNamespace(is_available=Mock(return_value=True))),
        mps=SimpleNamespace(
            recommended_max_memory=Mock(return_value=2**30),
            driver_allocated_memory=Mock(return_value=0),
            empty_cache=Mock(),
        ),
        device=Mock(side_effect=lambda _: nullcontext()),
    )


def test_device_probes_memory_and_cpu_only_skips_accelerators(monkeypatch):
    torch = fake_torch()
    monkeypatch.setattr(training, "_torch", lambda: (torch, None))
    assert training.device_info(cpu_only=True)["device"] == "cpu"
    torch.cuda.is_available.assert_not_called()
    torch.backends.mps.is_available.assert_not_called()
    assert training.best_device() == "cuda"
    torch.cuda.mem_get_info.return_value = (1, 2**31)
    assert training.best_device() == "cpu"
    torch.cuda.mem_get_info.side_effect = RuntimeError("driver not ready")
    assert training.best_device() == "cpu"
    torch.cuda.is_available.return_value = False
    assert training.best_device() == "mps"
    torch.mps.driver_allocated_memory.return_value = 2**30
    assert training.best_device() == "cpu"


def dataset(tmp_path):
    tmp_path.joinpath("dataset.json").write_text(json.dumps({
        "binary": True, "classes": ["bioturbation"], "tile": 32, "overlap": 8, "pxPerCm": 10,
    }), encoding="utf-8")
    return tmp_path / "model"


@pytest.mark.parametrize(("accelerator", "completed"), [("cuda", False), ("cuda", True), ("mps", True)])
def test_accelerator_oom_retries_once_on_cpu(monkeypatch, tmp_path, accelerator, completed):
    torch = fake_torch()
    torch.cuda.is_available.return_value = accelerator == "cuda"
    torch.save = lambda state, path: path.write_text(json.dumps(state), encoding="utf-8")
    monkeypatch.setattr(training, "_torch", lambda: (torch, None))
    out = dataset(tmp_path)
    ckpt = out.with_suffix(".ckpt")
    ckpt.write_text('{"epoch": 99}', encoding="utf-8")

    def attempt(*args, log_resume):
        device, resume, save_epoch = args[-3:]
        if device == accelerator:
            assert not resume and log_resume
            if completed:
                save_epoch({"epoch": 1, "model": {"weights": 1}}, out.with_suffix(".pt"), True)
            raise RuntimeError("out of memory")
        assert device == "cpu" and not log_resume and resume is completed
        assert json.loads(ckpt.read_text(encoding="utf-8"))["epoch"] == (1 if completed else 99)
        return {"ok": True}

    run = Mock(side_effect=attempt)
    monkeypatch.setattr(training, "_train_on_device", run)
    assert training.train(tmp_path, out, log=Mock()) == {"ok": True}
    assert run.call_count == 2
    getattr(torch, accelerator).empty_cache.assert_called_once()
    assert [c.args for c in torch.device.call_args_list] == [("cpu",), ("cpu",)]
    assert not list(tmp_path.glob(".*.tmp"))


def test_checkpoint_write_failure_preserves_last_completed_epoch(monkeypatch, tmp_path):
    torch = fake_torch()
    out = dataset(tmp_path)

    def save(state, path):
        path.write_text(json.dumps(state), encoding="utf-8")
        if state.get("epoch") == 2:
            raise RuntimeError("CUDA out of memory")

    torch.save = save
    monkeypatch.setattr(training, "_torch", lambda: (torch, None))

    def attempt(*args, log_resume):
        device, resume, save_epoch = args[-3:]
        if device == "cuda":
            for epoch in (1, 2):
                save_epoch({"epoch": epoch, "model": {"weights": epoch}}, out.with_suffix(".pt"), True)
        assert resume
        assert json.loads(out.with_suffix(".ckpt").read_text(encoding="utf-8"))["epoch"] == 1
        assert json.loads(out.with_suffix(".pt").read_text(encoding="utf-8")) == {"weights": 1}
        assert not list(tmp_path.glob(".*.tmp"))
        return {"ok": True}

    monkeypatch.setattr(training, "_train_on_device", attempt)
    assert training.train(tmp_path, out) == {"ok": True}


def test_cpu_only_override_and_non_device_errors_are_not_retried(monkeypatch, tmp_path):
    torch = fake_torch()
    monkeypatch.setattr(training, "_torch", lambda: (torch, None))
    out = dataset(tmp_path)
    run = Mock(side_effect=RuntimeError("out of memory"))
    monkeypatch.setattr(training, "_train_on_device", run)
    with pytest.raises(RuntimeError, match="out of memory"):
        training.train(tmp_path, out, device="cuda", cpu_only=True)
    torch.cuda.is_available.assert_not_called()
    assert run.call_args.args[-3] == "cpu" and run.call_count == 1

    run.reset_mock(side_effect=True)
    run.side_effect = RuntimeError("bad input shape")
    with pytest.raises(RuntimeError, match="bad input shape"):
        training.train(tmp_path, out)
    assert run.call_args.args[-3] == "cuda" and run.call_count == 1
    torch.cuda.empty_cache.assert_not_called()


def test_cpu_only_prediction_uses_cpu_even_for_a_custom_provider(monkeypatch, tmp_path):
    sessions = []

    class Session:
        def __init__(self, path, *, providers):
            self.providers = providers
            sessions.append(self)

        def get_inputs(self):
            return [SimpleNamespace(name="image")]

        def get_providers(self):
            return self.providers

        def run(self, outputs, data):
            assert self.providers == ["CPUExecutionProvider"]
            _, _, h, w = data["image"].shape
            return [np.ones((1, 1, h, w), np.float32)]

    monkeypatch.setitem(sys.modules, "onnxruntime", SimpleNamespace(InferenceSession=Session))
    net = OnnxUnet(tmp_path / "model.onnx")
    net.session.providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    mask, _ = mask_from_unet(np.zeros((3, 4), np.uint8), net, cpu_only=True)
    assert mask.all() and len(sessions) == 2
    assert net.session.providers[0] == "CUDAExecutionProvider"


@pytest.mark.parametrize("args", [["train", "data", "out"], ["predict", "image", "model"],
                                 ["evaluate", "export", "model"], ["device"]])
def test_unet_commands_accept_cpu_only(args):
    assert build_parser().parse_args(["unet", *args, "--cpu-only"]).cpu_only
