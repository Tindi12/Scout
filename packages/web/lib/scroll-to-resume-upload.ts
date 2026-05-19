export const RESUME_UPLOAD_SECTION_ID = 'resume-upload'

export function scrollToResumeUpload(): boolean {
  const el = document.getElementById(RESUME_UPLOAD_SECTION_ID)
  if (!el) return false
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return true
}
