"""
OmniNinja - FastAPI Backend Server
SSE streaming, sessions, file downloads.
"""

import os
import uuid
import asyncio
import json
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from ..agent.loop import OmniNinjaAgent
from ..agent.llm import LLMClient

app = FastAPI(title="OmniNinja API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

active_sessions: dict = {}


class TaskRequest(BaseModel):
    task: str
    model: str = "anthropic/claude-3.5-sonnet"
    session_id: str = None


class StopRequest(BaseModel):
    session_id: str


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "OmniNinja", "version": "1.0.0"}


@app.get("/api/models")
async def get_models():
    return {"models": LLMClient.available_models()}


@app.post("/api/task/stream")
async def run_task_stream(req: TaskRequest):
    session_id = req.session_id or str(uuid.uuid4())[:8]
    llm = LLMClient(model=req.model)
    agent = OmniNinjaAgent(session_id=session_id, llm_client=llm)
    active_sessions[session_id] = agent

    async def event_gen() -> AsyncGenerator[str, None]:
        yield f"data: {json.dumps({'type': 'session', 'session_id': session_id})}\n\n"
        try:
            async for event in agent.run(req.task):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0)
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
        finally:
            active_sessions.pop(session_id, None)
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@app.post("/api/task/stop")
async def stop_task(req: StopRequest):
    agent = active_sessions.get(req.session_id)
    if agent:
        agent.stop()
        return {"status": "stopped"}
    raise HTTPException(status_code=404, detail="Session not found")


@app.get("/api/session/{session_id}/files")
async def list_files(session_id: str):
    ws = Path(f"./workspace/session_{session_id}")
    if not ws.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    files = [
        {"name": str(f.relative_to(ws)), "size": f.stat().st_size,
         "download": f"/api/session/{session_id}/download/{f.relative_to(ws)}"}
        for f in ws.rglob("*") if f.is_file() and f.name != "_exec_temp.py"
    ]
    return {"session_id": session_id, "files": files}


@app.get("/api/session/{session_id}/download/{filename:path}")
async def download_file(session_id: str, filename: str):
    path = Path(f"./workspace/session_{session_id}/{filename}")
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(path), filename=filename)


@app.get("/api/session/{session_id}/todo")
async def get_todo(session_id: str):
    p = Path(f"./workspace/session_{session_id}/todo.md")
    return {"content": p.read_text(encoding="utf-8") if p.exists() else "(sem plano)"}


# Serve frontend
frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.api.server:app",
        host=os.getenv("OMNININJA_HOST", "0.0.0.0"),
        port=int(os.getenv("OMNININJA_PORT", 8000)),
        reload=False,
    )
