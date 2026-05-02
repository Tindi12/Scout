import os
from dotenv import load_dotenv
from groq import AsyncGroq
from google import genai
from google.genai import types
from groq import RateLimitError
from fastapi import HTTPException

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY not set")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set")

groq_client = AsyncGroq(api_key=GROQ_API_KEY)

gemini_client = genai.Client(api_key=GEMINI_API_KEY)

async def call_ai(prompt: str, system: str, task: str = "quality", stream: bool = False) -> str:
    try:
        try:
            model = "llama-3.1-8b-instant" if task == "fast" else "llama-3.3-70b-versatile"

            response = await groq_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt}
                ],
                stream=stream
            )

            if stream:
                return response
            else:
                return response.choices[0].message.content
        except RateLimitError:
            response = await gemini_client.aio.models.generate_content(
                model="gemini-1.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(system_instruction=system),
            )
            return response.text
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI routing failed: {str(e)}")
