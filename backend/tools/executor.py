"""
OmniNinja - Tool Executor
Executa codigo Python e comandos shell em ambiente isolado.
"""

import asyncio
import sys
from pathlib import Path


class ToolExecutor:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.workspace_dir = Path(f"./workspace/session_{session_id}")
        self.workspace_dir.mkdir(parents=True, exist_ok=True)

    async def run_python(self, code: str) -> str:
        try:
            code_file = self.workspace_dir / "_exec_temp.py"
            code_file.write_text(code, encoding="utf-8")

            proc = await asyncio.create_subprocess_exec(
                sys.executable, str(code_file),
                cwd=str(self.workspace_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
            except asyncio.TimeoutError:
                proc.kill()
                return "[ERRO] Timeout: codigo executou por mais de 60s"

            out = stdout.decode(errors="replace")
            err = stderr.decode(errors="replace")

            if proc.returncode != 0:
                return f"[ERRO exit={proc.returncode}]\n{err}\n{out}".strip()
            return out if out else "[OK - sem saida no stdout]"
        except Exception as e:
            return f"[ERRO DE EXECUCAO] {e}"

    async def run_shell(self, command: str) -> str:
        ALLOWED = {
            "ls", "cat", "echo", "pwd", "mkdir", "touch", "grep", "find",
            "curl", "wget", "git", "pip", "pip3", "python", "python3",
            "node", "npm", "npx", "cp", "mv", "head", "tail", "wc",
        }
        base = command.strip().split()[0]
        if base not in ALLOWED:
            return f"[BLOQUEADO] '{base}' nao e permitido. Permitidos: {', '.join(sorted(ALLOWED))}"

        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                cwd=str(self.workspace_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
            except asyncio.TimeoutError:
                proc.kill()
                return "[ERRO] Timeout: comando excedeu 30s"

            out = stdout.decode(errors="replace")
            err = stderr.decode(errors="replace")
            if proc.returncode != 0:
                return f"[ERRO exit={proc.returncode}]\n{err}\n{out}".strip()
            return out if out else "[OK]"
        except Exception as e:
            return f"[ERRO] {e}"

    def list_files(self) -> list:
        try:
            return sorted(
                str(f.relative_to(self.workspace_dir))
                for f in self.workspace_dir.rglob("*")
                if f.is_file() and f.name not in ("_exec_temp.py",)
            )
        except Exception:
            return []
