import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.clerk_router import router as clerk_router
from routes.copilot import router as copilot_router
from routes.jobs import router as jobs_router
from routes.notifications import router as notifications_router
from routes.resume import router as resume_router
from routes.scout import router as scout_router
from routes.strategy import router as strategy_router
from routes.stripe_router import router as stripe_router
from core.supabase_client import test_connection

load_dotenv()

API_VERSION = os.getenv("API_VERSION")

app = FastAPI(title="Scout API")

_origins_raw = os.getenv("ALLOWED_ORIGINS", "")
allowed_origins = [o.strip() for o in _origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": API_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "supabase": "connected" if test_connection() else "unreachable"
    }


app.include_router(resume_router, prefix="/resume", tags=["resume"])
app.include_router(jobs_router, prefix="/jobs", tags=["jobs"])
app.include_router(scout_router, prefix="/scout", tags=["scout"])
app.include_router(copilot_router, prefix="/copilot", tags=["copilot"])
app.include_router(strategy_router, prefix="/strategy", tags=["strategy"])
app.include_router(stripe_router, prefix="/stripe", tags=["stripe"])
app.include_router(notifications_router, prefix="/notifications", tags=["notifications"])
app.include_router(clerk_router, prefix="/clerk", tags=["clerk"])
