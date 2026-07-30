"""
OmniNinja - Core Agent Loop
Ciclo: analisar -> planejar -> executar -> observar (CodeAct)
"""

import asyncio
import uuid
import traceback
from datetime import datetime
from typing import AsyncGenerator

from ..tools.executor import ToolExecutor
from ..memory.workspace import WorkspaceMemory
from .planner import Planner
from .llm import LLMClient
from .prompts import SYSTEM_PROMPT


class AgentEvent:
    def __init__(self, event_type: str, content: str, metadata: dict = None):
        self.id = str(uuid.uuid4())[:8]
        self.type = event_type
        self.content = content
        self.metadata = metadata or {}
        self.timestamp = datetime.utcnow().isoformat()

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "content": self.content,
            "metadata": self.metadata,
            "timestamp": self.timestamp,
        }


class OmniNinjaAgent:
    MAX_ITERATIONS = 40

    def __init__(self, session_id: str, llm_client: LLMClient):
        self.session_id = session_id
        self.llm = llm_client
        self.executor = ToolExecutor(session_id=session_id)
        self.memory = WorkspaceMemory(session_id=session_id)
        self.planner = Planner(llm_client=llm_client)
        self.event_stream = []
        self.iteration = 0
        self.running = False

    def _add_event(self, event_type: str, content: str, metadata: dict = None) -> AgentEvent:
        ev = AgentEvent(event_type, content, metadata)
        self.event_stream.append(ev)
        return ev

    def _build_context(self) -> str:
        recent = self.event_stream[-30:]
        parts = []
        for ev in recent:
            label = {
                "user": "[USER REQUEST]",
                "plan": "[CURRENT PLAN]",
                "thinking": "[THINKING]",
                "action": "[ACTION EXECUTED]",
                "observation": "[OBSERVATION]",
                "knowledge": "[KNOWLEDGE]",
            }.get(ev.type, f"[{ev.type.upper()}]")
            parts.append(f"{label}\n{ev.content}")
        return "\n\n".join(parts)

    async def run(self, user_request: str) -> AsyncGenerator[dict, None]:
        self.running = True
        self.iteration = 0

        yield self._add_event("user", user_request).to_dict()
        yield self._add_event("thinking", "Analisando sua solicitacao e criando plano...").to_dict()

        try:
            plan = await self.planner.create_plan(user_request)
            self.memory.write_todo(plan)
            yield self._add_event("plan", plan).to_dict()
        except Exception as e:
            yield self._add_event("error", f"Erro ao criar plano: {e}").to_dict()
            self.running = False
            return

        consecutive_errors = 0

        while self.running and self.iteration < self.MAX_ITERATIONS:
            self.iteration += 1

            try:
                context = self._build_context()
                files = self.memory.list_files()
                todo = self.memory.read_todo()
                prompt = self._build_prompt(context, todo, files, self.iteration)

                llm_response = await self.llm.complete(system=SYSTEM_PROMPT, user=prompt)
                action = self._parse_action(llm_response)

                if action["type"] == "complete":
                    yield self._add_event("final", action.get("content", "Tarefa concluida!")).to_dict()
                    break

                elif action["type"] == "code":
                    code = action["content"]
                    self._add_event("action", f"```python\n{code}\n```")
                    yield self._add_event("thinking", f"Executando codigo Python (passo {self.iteration})...").to_dict()
                    result = await self.executor.run_python(code)
                    yield self._add_event("observation", result).to_dict()
                    consecutive_errors = 0

                elif action["type"] == "shell":
                    cmd = action["content"]
                    self._add_event("action", f"```bash\n{cmd}\n```")
                    yield self._add_event("thinking", "Executando comando shell...").to_dict()
                    result = await self.executor.run_shell(cmd)
                    yield self._add_event("observation", result).to_dict()
                    consecutive_errors = 0

                elif action["type"] == "message":
                    yield self._add_event("thinking", action["content"]).to_dict()

                else:
                    consecutive_errors += 1

                if consecutive_errors >= 4:
                    yield self._add_event("error", "Muitos erros consecutivos. Reformule sua solicitacao.").to_dict()
                    break

            except asyncio.CancelledError:
                yield self._add_event("error", "Execucao cancelada.").to_dict()
                break
            except Exception as e:
                consecutive_errors += 1
                yield self._add_event("error", f"Erro na iteracao {self.iteration}: {str(e)}").to_dict()
                if consecutive_errors >= 4:
                    break

        if self.iteration >= self.MAX_ITERATIONS:
            yield self._add_event("error", f"Limite de {self.MAX_ITERATIONS} iteracoes atingido.").to_dict()

        self.running = False

    def _build_prompt(self, context: str, todo: str, files: list, iteration: int) -> str:
        files_str = "\n".join(f"  - {f}" for f in files) if files else "  (nenhum arquivo ainda)"
        return f"""Iteracao {iteration} da execucao autonoma.

=== CONTEXTO ===
{context}

=== PLANO ATUAL (todo.md) ===
{todo}

=== ARQUIVOS NO WORKSPACE ===
{files_str}

=== INSTRUCAO ===
Escolha a PROXIMA ACAO. Use EXATAMENTE um dos formatos:

ACTION: code
```python
# codigo python aqui
```

ACTION: shell
```bash
comando aqui
```

ACTION: message
mensagem de progresso aqui

ACTION: complete
resposta final completa aqui

Apenas UMA acao por vez.
"""

    def _parse_action(self, response: str) -> dict:
        lines = response.strip().splitlines()
        action_type = None
        content_lines = []
        in_block = False

        for line in lines:
            if line.startswith("ACTION:"):
                action_type = line.replace("ACTION:", "").strip().lower()
                continue
            if action_type and not in_block:
                if line.strip().startswith("```"):
                    in_block = True
                    continue
                content_lines.append(line)
            elif in_block:
                if line.strip() == "```":
                    in_block = False
                else:
                    content_lines.append(line)

        if not action_type:
            return {"type": "message", "content": response.strip()}

        return {"type": action_type, "content": "\n".join(content_lines).strip()}

    def stop(self):
        self.running = False
