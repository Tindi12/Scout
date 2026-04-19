class ResumeScorer:
    async def score(self, resume_text: str) -> dict[str, object]:
        raise NotImplementedError
