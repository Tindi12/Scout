class StrategyEngine:
    async def weekly_plan(self, user_id: str) -> dict[str, object]:
        raise NotImplementedError
