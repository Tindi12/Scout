class EmbeddingService:
    async def embed_text(self, text: str) -> list[float]:
        raise NotImplementedError
