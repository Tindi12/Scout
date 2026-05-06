import pdfplumber
import docx
import io
import logging
from fastapi import HTTPException
from fastapi.concurrency import run_in_threadpool
from storage3.exceptions import StorageApiError

from core.supabase_client import supabase

logger = logging.getLogger(__name__)

class ResumeParser:
    def __init__(self, supabase_client):
        self.supabase = supabase_client

    def extract_text_from_pdf(self, file_bytes: bytes) -> str:
        # use pdfplumber to extract text
        # pdfplumber opens from bytes using io.BytesIO
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                return "\n".join((page.extract_text() or "") for page in pdf.pages)
        except Exception as e:
            logger.exception("Failed to extract text from PDF")
            raise HTTPException(status_code=400, detail=f"Failed to extract text from PDF: {e}")
            
        
    def extract_text_from_docx(self, file_bytes: bytes) -> str:
        # use python-docx to extract text
        # python-docx opens from bytes using io.BytesIO
        try:
            doc = docx.Document(io.BytesIO(file_bytes))
            return "\n".join(paragraph.text for paragraph in doc.paragraphs)
        except Exception as e:
            logger.exception("Failed to extract text from DOCX")
            raise HTTPException(status_code=400, detail=f"Failed to extract text from DOCX: {e}")


    async def parse_resume(self, storage_path: str, file_type: str) -> str:
        # 1. download file bytes from Supabase Storage
        # 2. route to correct extractor based on file_type
        # 3. return extracted text string
        # 4. raise HTTPException 400 if file_type is unsupported
        # 5. raise HTTPException 422 if extracted text is empty
        # (means the PDF is image-based and can't be parsed)

        try:
            normalized_file_type = file_type.lower().strip()
            logger.info("Parsing resume from storage", extra={"storage_path": storage_path, "file_type": normalized_file_type})

            file_bytes = await run_in_threadpool(
                lambda: self.supabase.storage.from_("resumes").download(storage_path)
            )
            if not file_bytes:
                raise HTTPException(status_code=404, detail="File not found")

            if normalized_file_type == "pdf":
                text = await run_in_threadpool(self.extract_text_from_pdf, file_bytes)
            elif normalized_file_type == "docx":
                text = await run_in_threadpool(self.extract_text_from_docx, file_bytes)
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_type}")

            if not text or not text.strip():
                raise HTTPException(
                    status_code=422,
                    detail="Could not extract text. PDF may be image-based or scanned.",
                )

            return text
        except HTTPException:
            raise
        except StorageApiError as e:
            msg_lower = (e.message or "").lower()
            status = e.status
            if status == 404 or status == "404" or "not found" in msg_lower or "no such" in msg_lower:
                raise HTTPException(status_code=404, detail="File not found")
            logger.exception(
                "Storage download failed",
                extra={"storage_path": storage_path, "status": status},
            )
            raise HTTPException(
                status_code=502,
                detail=f"Storage error: {e.message or status}",
            )
        except Exception as e:
            logger.exception("Unexpected resume parsing failure", extra={"storage_path": storage_path, "file_type": file_type})
            raise HTTPException(status_code=500, detail=f"Failed to parse resume: {e}")


resume_parser = ResumeParser(supabase)
