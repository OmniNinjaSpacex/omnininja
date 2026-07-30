"""
OmniNinja - Planner Module
"""


class Planner:
    def __init__(self, llm_client):
        self.llm = llm_client

    async def create_plan(self, user_request: str) -> str:
        prompt = f"""Voce e um agente de planejamento. O usuario deseja:

"{user_request}"

Crie um plano de execucao detalhado em etapas numeradas.
Use o formato exato:

[ ] 1. Primeira etapa
[ ] 2. Segunda etapa
[ ] 3. Terceira etapa

Maximo 10 etapas. Seja direto e pratico."""

        plan = await self.llm.complete(
            system="Voce e um especialista em planejamento de tarefas para agentes de IA autonomos.",
            user=prompt,
        )
        return plan.strip()
