"""FastAPI application entry point: ``uvicorn app.main:app``."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Listener registration order matters: timeline → scoring → automations, so a
# rule triggered on lead.created already sees the computed score.
from . import automations, scoring, timeline  # noqa: F401
from . import __version__
from . import ai
from .ai_api import router as ai_router
from .api import install_error_handlers, router
from . import db as dbmod

FRONTEND_DIST = Path(os.environ.get("KESHER_FRONTEND", Path(__file__).resolve().parents[2] / "frontend" / "dist"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    dbmod.Base.metadata.create_all(dbmod.engine)
    if os.environ.get("KESHER_SEED", "on") != "off":
        from .seed import seed_if_empty

        with dbmod.SessionLocal() as db:
            seed_if_empty(db)
    stop = ai.start_worker(dbmod.SessionLocal) if os.environ.get("KESHER_AI_WORKER", "on") == "on" else None
    yield
    if stop:
        stop.set()


def create_app() -> FastAPI:
    app = FastAPI(title="KESHER CRM", version=__version__, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.environ.get("KESHER_CORS", "http://localhost:5173").split(","),
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(ai_router)
    app.include_router(router)
    install_error_handlers(app)

    @app.get("/healthz")
    def healthz():
        return {"ok": True, "version": __version__}

    if FRONTEND_DIST.is_dir():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            candidate = FRONTEND_DIST / path
            if path and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(FRONTEND_DIST / "index.html")

    return app


app = create_app()
