"""Start CrimeMap's FastAPI backend and Vite frontend together on Fedora/Linux.

Run from anywhere with: python3 /path/to/CrimeMap/start.py

Uses backend/.venv and frontend/node_modules, without activating a shell.
Ctrl+C stops both process groups, including Vite and Uvicorn reload children.
"""
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
PYTHON = BACKEND / ".venv" / "bin" / "python"


def prerequisites() -> bool:
    if not BACKEND.is_dir() or not FRONTEND.is_dir():
        print("Error: start.py must live in the CrimeMap repository root.", file=sys.stderr)
        return False
    if not PYTHON.is_file():
        print(
            "Backend Python environment missing. Run:\n"
            "  cd backend\n"
            "  python3 -m venv .venv\n"
            "  .venv/bin/python -m pip install -r requirements-dev.txt",
            file=sys.stderr,
        )
        return False
    if shutil.which("npm") is None:
        print("Error: Node.js/npm is not installed or is not on PATH.", file=sys.stderr)
        return False
    if not (FRONTEND / "node_modules" / ".bin" / "vite").exists():
        print("Frontend dependencies missing. Run: cd frontend && npm install", file=sys.stderr)
        return False
    result = subprocess.run(
        [str(PYTHON), "-c", "import uvicorn; import sqlalchemy"],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        print(
            "Backend dependencies missing. Run: cd backend && "
            ".venv/bin/python -m pip install -r requirements-dev.txt",
            file=sys.stderr,
        )
        return False
    return True


def terminate(processes: list[subprocess.Popen]) -> None:
    """Stop both *groups* so Vite/Uvicorn child processes don't stay running."""
    for process in processes:
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    for process in processes:
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()


def main() -> int:
    if os.name != "posix":
        print("This starter currently supports Fedora/Linux and macOS.", file=sys.stderr)
        return 1
    if not prerequisites():
        return 1

    processes: list[subprocess.Popen] = []
    previous_term = signal.getsignal(signal.SIGTERM)

    def handle_term(_signal: int, _frame: object) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, handle_term)
    try:
        print("Starting CrimeMap (press Ctrl+C to stop both servers)...", flush=True)
        processes.append(subprocess.Popen(
            [str(PYTHON), "-m", "uvicorn", "app.main:app",
             "--reload", "--host", "127.0.0.1", "--port", "8000"],
            cwd=BACKEND, start_new_session=True,
        ))
        processes.append(subprocess.Popen(
            ["npm", "run", "dev", "--", "--host", "127.0.0.1",
             "--port", "5173", "--strictPort"],
            cwd=FRONTEND, start_new_session=True,
        ))
        print(
            "\n  Frontend: http://127.0.0.1:5173\n"
            "  API docs: http://127.0.0.1:8000/docs\n"
            "  Backend:  http://127.0.0.1:8000\n"
            "\nLogs from both servers appear below. Ctrl+C stops both.\n",
            flush=True,
        )
        while True:
            for name, process in zip(("Backend", "Frontend"), processes):
                code = process.poll()
                if code is not None:
                    print(
                        f"\n{name} exited with code {code}. Stopping the other server.",
                        file=sys.stderr, flush=True,
                    )
                    return code or 1
            time.sleep(0.25)
    except KeyboardInterrupt:
        print("\nStopping CrimeMap...", flush=True)
        return 0
    except OSError as exc:
        print(f"Failed to start CrimeMap: {exc}", file=sys.stderr)
        return 1
    finally:
        terminate(processes)
        signal.signal(signal.SIGTERM, previous_term)


if __name__ == "__main__":
    sys.exit(main())
