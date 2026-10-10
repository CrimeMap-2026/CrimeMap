"""Smoke tests for the Fedora/Fish-friendly single-command launcher."""
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "start.py"


def load_launcher():
    assert SCRIPT.is_file()
    spec = importlib.util.spec_from_file_location("crimemap_launcher", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_launcher_uses_repo_relative_paths_and_fixed_ports(monkeypatch):
    launcher = load_launcher()
    assert launcher.ROOT == ROOT
    assert launcher.BACKEND == ROOT / "backend"
    assert launcher.FRONTEND == ROOT / "frontend"
    assert launcher.PYTHON == ROOT / "backend" / ".venv" / "bin" / "python"

    started = []
    stopped = []

    class FakeProcess:
        def __init__(self, args, **kwargs):
            self.pid = 50000 + len(started)
            self.args = args
            self.kwargs = kwargs
            started.append(self)

        def poll(self):
            return None

        def wait(self, timeout=None):
            return 0

    def interrupt(_seconds):
        raise KeyboardInterrupt()

    monkeypatch.setattr(launcher, "prerequisites", lambda: True)
    monkeypatch.setattr(launcher.subprocess, "Popen", FakeProcess)
    monkeypatch.setattr(launcher.time, "sleep", interrupt)
    monkeypatch.setattr(launcher.os, "killpg", lambda pid, sig: stopped.append((pid, sig)))

    assert launcher.main() == 0
    assert len(started) == 2
    assert started[0].kwargs["cwd"] == ROOT / "backend"
    assert started[1].kwargs["cwd"] == ROOT / "frontend"
    assert started[0].kwargs["start_new_session"] is True
    assert started[1].kwargs["start_new_session"] is True
    assert ["--port", "8000"] == started[0].args[-2:]
    assert "--strictPort" in started[1].args
    assert "5173" in started[1].args
    assert {pid for pid, _ in stopped} == {item.pid for item in started}


def test_launcher_reports_missing_backend_environment(monkeypatch, tmp_path, capsys):
    launcher = load_launcher()
    monkeypatch.setattr(launcher, "PYTHON", tmp_path / "missing" / "python")
    assert launcher.prerequisites() is False
    output = capsys.readouterr()
    assert "python3 -m venv .venv" in output.err
