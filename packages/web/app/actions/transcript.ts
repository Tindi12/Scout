'use server'

import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

// Transcript upload for the Scout Agent: some university/new-grad postings
// (e.g. Greenhouse) require an unofficial transcript. The file lives in the
// existing private 'resumes' storage bucket (service-role access only) under a
// transcript/ prefix; the pointer columns live on users.* so the apply worker
// can fetch the bytes without a join.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const MAX_BYTES = 10 * 1024 * 1024
const STORAGE_BUCKET = 'resumes'

export type TranscriptInfo = {
  filename: string
  uploadedAt: string | null
}

function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[/\\]/, '')
  const cleaned = base.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_')
  return cleaned.slice(0, 200) || 'transcript.pdf'
}

/**
 * Current transcript on file, or null when none. Also returns null (feature
 * dark, no crash) while the transcript_* columns migration has not been
 * applied yet — unlike getProfile, a select error here must not take the
 * whole profile page down.
 */
export async function getTranscript(): Promise<TranscriptInfo | null> {
  const { userId } = await auth()
  if (!userId) return null

  const { data, error } = await supabase
    .from('users')
    .select('transcript_filename, transcript_uploaded_at')
    .eq('clerk_id', userId)
    .maybeSingle()

  if (error || !data?.transcript_filename) return null
  return {
    filename: data.transcript_filename,
    uploadedAt: data.transcript_uploaded_at ?? null,
  }
}

export async function uploadTranscript(formData: FormData): Promise<
  { success: true; transcript: TranscriptInfo } | { success: false; error: string }
> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'Unauthorized' }

  const raw = formData.get('file')
  if (!(raw instanceof File)) {
    return { success: false, error: 'No file uploaded' }
  }
  if (raw.size === 0) {
    return { success: false, error: 'File is empty' }
  }
  if (raw.size > MAX_BYTES) {
    return { success: false, error: 'File must be under 10MB' }
  }
  // PDF only: the apply agent attaches this file directly to ATS forms, and
  // PDF is the one format every ATS transcript field accepts.
  if (raw.type && raw.type !== 'application/pdf') {
    return { success: false, error: 'Please upload a PDF file' }
  }

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id, transcript_storage_path')
    .eq('clerk_id', userId)
    .maybeSingle()

  if (userError) {
    console.error('Transcript user lookup error:', userError)
    return {
      success: false,
      error: userError.message.includes('transcript_storage_path')
        ? 'Transcript storage is not set up yet'
        : 'Failed to load your profile',
    }
  }
  if (!userRow) return { success: false, error: 'Profile not found' }

  const storagePath = `${userId}/transcript/${Date.now()}_${sanitizeFilename(raw.name)}`
  const buffer = Buffer.from(await raw.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (uploadError) {
    console.error('Transcript storage upload error:', uploadError)
    return { success: false, error: 'Failed to upload file' }
  }

  const uploadedAt = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('users')
    .update({
      transcript_storage_path: storagePath,
      transcript_filename: raw.name,
      transcript_uploaded_at: uploadedAt,
    })
    .eq('clerk_id', userId)

  if (updateError) {
    console.error('Transcript record update error:', updateError)
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath])
    return { success: false, error: 'Failed to save transcript record' }
  }

  // Best-effort cleanup of the replaced file — the DB already points at the new one.
  const oldPath = userRow.transcript_storage_path as string | null
  if (oldPath && oldPath !== storagePath) {
    await supabase.storage.from(STORAGE_BUCKET).remove([oldPath])
  }

  return {
    success: true,
    transcript: { filename: raw.name, uploadedAt },
  }
}

export async function deleteTranscript(): Promise<
  { success: true } | { success: false; error: string }
> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'Unauthorized' }

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('transcript_storage_path')
    .eq('clerk_id', userId)
    .maybeSingle()

  if (userError || !userRow) {
    return { success: false, error: 'Failed to load your profile' }
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({
      transcript_storage_path: null,
      transcript_filename: null,
      transcript_uploaded_at: null,
    })
    .eq('clerk_id', userId)

  if (updateError) {
    console.error('Transcript record clear error:', updateError)
    return { success: false, error: 'Failed to remove transcript' }
  }

  const oldPath = userRow.transcript_storage_path as string | null
  if (oldPath) {
    await supabase.storage.from(STORAGE_BUCKET).remove([oldPath])
  }

  return { success: true }
}
