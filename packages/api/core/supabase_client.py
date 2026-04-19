import os

from supabase import Client, create_client


def get_supabase_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        msg = "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
        raise RuntimeError(msg)
    return create_client(url, key)
