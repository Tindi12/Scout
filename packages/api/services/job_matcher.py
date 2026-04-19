class JobMatcher:
    async def match(self, resume_embedding: list[float], job_ids: list[str]) -> list[str]:
        raise NotImplementedError
