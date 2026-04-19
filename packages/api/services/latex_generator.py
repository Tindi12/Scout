class LatexGenerator:
    async def render_pdf(self, tex_source: str) -> bytes:
        raise NotImplementedError
