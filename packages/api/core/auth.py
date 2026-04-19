from typing import Annotated, Any

from fastapi import Depends, Header


async def verify_clerk_jwt(
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, Any] | None:
    if authorization is None:
        return None
    return {"sub": None, "authorization": authorization}
