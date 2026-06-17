import logging
import os
import time

import httpx
from supabase import Client, create_client
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


# Connection drops on idle keep-alive connections (intermittent 500s).
# supabase-py's sync httpx client reuses HTTP/2 keep-alive connections that Supabase
# closes after it's been idle; the next query then raises RemoteProtocolError
# ("Server disconnected"). The dead connection is evicted on failure, so an immediate
# retry gets a fresh one (observed live: two 500s then a 200). We retry ONLY idempotent
# methods so a write (insert/update/delete) is never silently re-sent.
_RETRYABLE_TRANSPORT_ERRORS = (
    httpx.RemoteProtocolError,
    httpx.ConnectError,
    httpx.ReadError,
)
_IDEMPOTENT_METHODS = {"GET", "HEAD", "OPTIONS"}
_MAX_TRANSPORT_RETRIES = 2


def _install_postgrest_retry(client: Client) -> None:
    """Wrap the PostgREST httpx session so dropped idempotent requests retry once."""
    try:
        session = client.postgrest.session
        original_request = session.request
    except Exception:  # pragma: no cover - defensive across supabase-py versions
        logger.warning("Could not install Supabase retry wrapper; continuing without it")
        return

    def request_with_retry(method, url, *args, **kwargs):
        attempt = 0
        while True:
            try:
                return original_request(method, url, *args, **kwargs)
            except _RETRYABLE_TRANSPORT_ERRORS as exc:
                attempt += 1
                if (
                    str(method).upper() not in _IDEMPOTENT_METHODS
                    or attempt > _MAX_TRANSPORT_RETRIES
                ):
                    raise
                logger.warning(
                    "Supabase %s dropped (%s); retry %d/%d",
                    method,
                    exc.__class__.__name__,
                    attempt,
                    _MAX_TRANSPORT_RETRIES,
                )
                time.sleep(0.25 * attempt)

    session.request = request_with_retry


_install_postgrest_retry(supabase)

def test_connection() -> bool:
    try:
        supabase.table("users").select("id").limit(1).execute()
        return True
    except Exception:
        return False