from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from dotenv import load_dotenv
import os

load_dotenv()

security = HTTPBearer()

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

async def verify_clerk_jwt(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="server configuration error")


    try:
        payload = jwt.decode(credentials.credentials, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
        result = payload.get("sub")
        if not result:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token claims")
        return {"sub": result, "email": payload.get("email")}
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

async def require_pro(current_user: dict = Depends(verify_clerk_jwt)) -> dict:
    from core.supabase_client import supabase

    user = supabase.table("users")\
        .select("is_pro")\
        .eq("clerk_id", current_user["sub"])\
        .single()\
        .execute()

    if not user.data or not user.data.get["is_pro"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Pro subscription required"
        )

    return current_user

    


