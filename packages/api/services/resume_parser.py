class ResumeParser:
    async def parse(self, file_bytes: bytes, filename: str) -> dict[str, object]:
        raise NotImplementedError
