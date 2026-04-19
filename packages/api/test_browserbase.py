import os
from dotenv import load_dotenv

load_dotenv()

BROWSERBASE_API_KEY = os.getenv("BROWSERBASE_API_KEY")
BROWSERBASE_PROJECT_ID = os.getenv("BROWSERBASE_PROJECT_ID")

if not BROWSERBASE_API_KEY:
    raise RuntimeError("BROWSERBASE_API_KEY not set")

if not BROWSERBASE_PROJECT_ID:
    raise RuntimeError("BROWSERBASE_PROJECT_ID not set")

print("API key found:", BROWSERBASE_API_KEY[:8] + "...")
print("Project ID found:", BROWSERBASE_PROJECT_ID)
print("Attempting to create a Browserbase session...")

from browserbase import Browserbase

bb = Browserbase(api_key=BROWSERBASE_API_KEY)

session = bb.sessions.create(project_id=BROWSERBASE_PROJECT_ID)

print("Session created successfully")
print("Session ID:", session.id)
print("Session status:", session.status)

bb.sessions.update(session.id, status="REQUEST_RELEASE")
print("Session released successfully")
print("Browserbase is working correctly")