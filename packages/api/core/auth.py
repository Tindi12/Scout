from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import os

load_dotenv()

security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
INTERNAL_SECRET = (os.getenv("SCOUT_INTERNAL_API_SECRET") or "").strip()


def _user_from_supabase_jwt(token: str) -> dict:
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="server configuration error",
        )
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        result = payload.get("sub")
        if not result:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token claims",
            )
        return {"sub": result, "email": payload.get("email")}
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


async def verify_clerk_jwt(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    return _user_from_supabase_jwt(credentials.credentials)


async def verify_resume_api_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_optional),
) -> dict:
    """
    Accept either:
    - Trusted Next.js proxy: X-Scout-Internal + X-Clerk-User-Id (same secret as web .env)
    - Direct Bearer token: Supabase-compatible JWT (legacy / external clients)
    """
    internal = (request.headers.get("X-Scout-Internal") or "").strip()
    clerk_header = (request.headers.get("X-Clerk-User-Id") or "").strip()
    if INTERNAL_SECRET and internal == INTERNAL_SECRET and clerk_header:
        return {"sub": clerk_header, "email": None}

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
        )
    return _user_from_supabase_jwt(credentials.credentials)

async def require_pro(current_user: dict = Depends(verify_resume_api_user)) -> dict:
    from core.supabase_client import supabase

    user = (
        supabase.table("users")
        .select("is_pro")
        .eq("clerk_id", current_user["sub"])
        .maybe_single()
        .execute()
    )

    if not user.data or not user.data.get("is_pro"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Pro subscription required",
        )

    return current_user

    


