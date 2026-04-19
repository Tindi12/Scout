from collections.abc import AsyncIterator
from typing import Union

StreamResult = Union[str, AsyncIterator[str]]


async def call_ai(
    prompt: str,
    system: str,
    task: str = "quality",
    stream: bool = False,
) -> StreamResult:
    raise NotImplementedError
