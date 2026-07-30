"""
OmniNinja - Workspace Memory
Memoria baseada em arquivos com todo.md (igual ao Manus AI).
"""

import json
from pathlib import Path
from datetime import datetime


class WorkspaceMemory:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.base_dir = Path(f"./workspace/session_{session_id}")
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.todo_path  = self.base_dir / "todo.md"
        self.notes_path = self.base_dir / "notes.md"
        self.log_path   = self.base_dir / "log.jsonl"

    def write_todo(self, plan_text: str):
        self.todo_path.write_text(f"# OmniNinja - Plano\n\n{plan_text}\n", encoding="utf-8")

    def read_todo(self) -> str:
        return self.todo_path.read_text(encoding="utf-8") if self.todo_path.exists() else "(sem plano)"

    def mark_done(self, step: int):
        if self.todo_path.exists():
            c = self.todo_path.read_text(encoding="utf-8")
            self.todo_path.write_text(c.replace(f"[ ] {step}.", f"[x] {step}."), encoding="utf-8")

    def append_note(self, note: str):
        ts = datetime.utcnow().strftime("%H:%M:%S")
        with open(self.notes_path, "a", encoding="utf-8") as f:
            f.write(f"\n## [{ts}]\n{note}\n")

    def read_notes(self) -> str:
        return self.notes_path.read_text(encoding="utf-8") if self.notes_path.exists() else ""

    def log_event(self, event_type: str, content: str):
        entry = {"ts": datetime.utcnow().isoformat(), "type": event_type, "content": content[:400]}
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def list_files(self) -> list:
        try:
            return sorted(
                str(f.relative_to(self.base_dir))
                for f in self.base_dir.rglob("*")
                if f.is_file() and f.name not in ("_exec_temp.py",)
            )
        except Exception:
            return []

    def read_file(self, filename: str) -> str:
        try:
            return (self.base_dir / filename).read_text(encoding="utf-8")
        except Exception as e:
            return f"[ERRO]: {e}"

    def write_file(self, filename: str, content: str):
        p = self.base_dir / filename
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")

    def sync_executor_files(self, executor):
        pass  # executor ja escreve no mesmo diretorio

    def get_summary(self) -> dict:
        return {
            "session_id": self.session_id,
            "files": self.list_files(),
            "todo": self.read_todo(),
        }
