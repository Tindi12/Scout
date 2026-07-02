import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from core.observability import init_sentry
from core.redis_client import get_redis
from routes.account import router as account_router
from routes.applications import router as applications_router
from routes.apply_code import router as apply_code_router
from routes.clerk_router import router as clerk_router
from routes.copilot import router as copilot_router
from routes.jobs import router as jobs_router
from routes.newsletter import router as newsletter_router
from routes.notifications import router as notifications_router
from routes.resume import router as resume_router
from routes.scout import router as scout_router
from routes.strategy import router as strategy_router
from routes.stripe_router import router as stripe_router
from routes.user import router as user_router
from core.supabase_client import test_connection

load_dotenv()

# Initialize Sentry before the app is created so startup errors are captured too.
# No-ops cleanly when SENTRY_DSN is unset (local dev).
init_sentry()

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


# Baseline security headers for every API response. CSP is omitted here on purpose —
# the API serves JSON, not HTML, so a content policy adds no value; the browser-facing
# CSP lives in packages/web/next.config.mjs. These three are still worth setting on a
# JSON API: nosniff stops content-type confusion, DENY blocks framing, and HSTS pins
# HTTPS (Railway terminates TLS). setdefault so a route can override if it ever needs to.
@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault(
        "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
    )
    return response


def _redis_healthy() -> bool:
    try:
        return bool(get_redis().ping())
    except Exception:
        return False


@app.get("/health")
async def health():
    """Liveness + dependency readiness. Probes Supabase and Redis independently so the
    body shows WHICH dependency is down; any failure returns 503 so Railway and uptime
    checks treat the instance as unhealthy instead of silently routing to a broken app."""
    supabase_ok = await run_in_threadpool(test_connection)
    redis_ok = await run_in_threadpool(_redis_healthy)
    healthy = supabase_ok and redis_ok
    return JSONResponse(
        {
            "status": "ok" if healthy else "degraded",
            "version": API_VERSION,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "supabase": "connected" if supabase_ok else "unreachable",
            "redis": "connected" if redis_ok else "unreachable",
        },
        status_code=200 if healthy else 503,
    )


app.include_router(resume_router, prefix="/resume", tags=["resume"])
app.include_router(jobs_router, prefix="/jobs", tags=["jobs"])
app.include_router(applications_router, prefix="/applications", tags=["applications"])
app.include_router(scout_router, prefix="/scout", tags=["scout"])
app.include_router(copilot_router, prefix="/copilot", tags=["copilot"])
app.include_router(strategy_router, prefix="/strategy", tags=["strategy"])
app.include_router(stripe_router, prefix="/stripe", tags=["stripe"])
app.include_router(notifications_router, prefix="/notifications", tags=["notifications"])
app.include_router(newsletter_router, prefix="/newsletter", tags=["newsletter"])
app.include_router(clerk_router, prefix="/clerk", tags=["clerk"])
app.include_router(user_router, prefix="/user", tags=["user"])
app.include_router(account_router, prefix="/account", tags=["account"])
# Public (token-authenticated) mid-run agent channel — no prefix: the system prompt
# hands the agent absolute URLs /apply-control/{token} and /apply-code/{token}.
app.include_router(apply_code_router, tags=["apply-code"])
