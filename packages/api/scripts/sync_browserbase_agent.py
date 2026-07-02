"""
Create or update the Scout Browserbase Agent template, then print its id.

The apply engine (services/browserbase_agent.py) runs against ONE reusable agent whose
system prompt + result schema live in that module. In prod, pin the id so every worker
reuses it instead of creating a new agent on first apply:

    cd packages/api
    uv run python scripts/sync_browserbase_agent.py            # create (prints the id)
    uv run python scripts/sync_browserbase_agent.py <agentId>  # update an existing agent

Then set BROWSERBASE_AGENT_ID=<id> in Railway (and .env locally). Re-run this whenever
SYSTEM_PROMPT or RESULT_SCHEMA changes so the pinned agent picks up the new config
(the run also sends resultSchema each time, but the systemPrompt is only updated here).
"""
import sys
from pathlib import Path

# Allow `uv run python scripts/sync_browserbase_agent.py` from packages/api:
# when invoked by path, sys.path[0] is this scripts/ dir, so add the api root so
# `core` / `services` resolve the same way as uvicorn.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.browserbase_agents import get_client  # noqa: E402
from services.browserbase_agent import AGENT_NAME, RESULT_SCHEMA, SYSTEM_PROMPT  # noqa: E402


def main() -> int:
    client = get_client()
    agent_id = sys.argv[1].strip() if len(sys.argv) > 1 else ""

    if agent_id:
        client.update_agent(
            agent_id,
            name=AGENT_NAME,
            system_prompt=SYSTEM_PROMPT,
            result_schema=RESULT_SCHEMA,
        )
        print(f"Updated Browserbase agent: {agent_id}")
    else:
        created = client.create_agent(
            name=AGENT_NAME, system_prompt=SYSTEM_PROMPT, result_schema=RESULT_SCHEMA
        )
        agent_id = created.get("agentId") or created.get("id") or ""
        print(f"Created Browserbase agent: {agent_id}")

    print("\nPin this in Railway (prod) and .env (local):")
    print(f"  BROWSERBASE_AGENT_ID={agent_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
