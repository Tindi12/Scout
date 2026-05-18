import asyncio
from core.auth import verify_clerk_jwt
from services.job_matcher import match_jobs
from core.supabase_client import supabase
from core.embedding_service import generate_embedding

async def test():
    # Fetch your test user
    user = supabase.table("users")\
        .select("id, is_pro, requires_sponsorship")\
        .eq("email", "tindibrown12@gmail.com")\
        .single()\
        .execute()
    
    user_row = user.data
    print(f"User: {user_row}")
    
    # Fetch latest analysis
    analysis = supabase.table("analyses")\
        .select("resume_id")\
        .eq("user_id", user_row["id"])\
        .order("created_at", desc=True)\
        .limit(1)\
        .single()\
        .execute()
    
    # Fetch resume
    resume = supabase.table("resumes")\
        .select("embedding, parsed_content")\
        .eq("id", analysis.data["resume_id"])\
        .single()\
        .execute()
    
    embedding = resume.data["embedding"]
    
    if not embedding:
        print("Generating embedding...")
        import json
        text = json.dumps(resume.data["parsed_content"])[:3000]
        embedding = await generate_embedding(text)
    
    print("Matching jobs...")
    results = await match_jobs(
        parsed_resume=resume.data["parsed_content"],
        resume_embedding=embedding,
        is_pro=True,
        requires_sponsorship=False,
        limit=10
    )
    
    print(f"Found {len(results)} matches:")
    for job in results:
        print(f"  {job['category']} | {job['final_score']}% | {job['title']} at {job['company']}")

asyncio.run(test())