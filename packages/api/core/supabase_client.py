import os
from supabase import Client, create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def test_connection() -> bool:
    try:
        supabase.table("users").select("id").limit(1).execute()
        return True
    except Exception:
        return False