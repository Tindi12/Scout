'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[/\\]/, '')
  const cleaned = base.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_')
  return cleaned.slice(0, 200) || 'resume'
}

export async function uploadResume(formData: FormData): Promise<{
  success: boolean
  storagePath?: string
  resumeId?: string
  error?: string
}> {
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: 'Unauthorized' }
  }

  const formUserId = formData.get('userId')
  if (typeof formUserId === 'string' && formUserId !== userId) {
    return { success: false, error: 'Unauthorized' }
  }

  const rawSupabaseUserId = formData.get('supabaseUserId')
  const supabaseUserId =
    typeof rawSupabaseUserId === 'string' ? rawSupabaseUserId : ''

  // Self-heal: if supabaseUserId is empty, find or create the user row
  let resolvedSupabaseUserId = supabaseUserId.trim()

  if (!resolvedSupabaseUserId) {
    // Try to find existing row by clerk_id
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', userId)
      .maybeSingle()

    if (existingUser) {
      resolvedSupabaseUserId = existingUser.id
    } else {
      // User row missing — create a minimal one
      const client = await clerkClient()
      const clerkUser = await client.users.getUser(userId)
      const email = clerkUser.emailAddresses[0]?.emailAddress

      if (!email) return { success: false, error: 'Cannot resolve user' }

      const { data: newUser, error: upsertError } = await supabase
        .from('users')
        .upsert({
          clerk_id: userId,
          email,
          name: `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim(),
          is_pro: false,
          onboarding_complete: false,
          profile_complete: false,
          copilot_messages_used: 0,
        })
        .select('id')
        .single()

      if (upsertError || !newUser) {
        return { success: false, error: 'Failed to resolve user profile' }
      }

      resolvedSupabaseUserId = newUser.id
    }
  }

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

  if (raw.type && !ACCEPT_MIME.has(raw.type)) {
    return { success: false, error: 'Please upload a PDF or DOCX file' }
  }

  const storagePath = `${userId}/${Date.now()}_${sanitizeFilename(raw.name)}`
  const buffer = Buffer.from(await raw.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from('resumes')
    .upload(storagePath, buffer, {
      contentType: raw.type || 'application/octet-stream',
      upsert: false,
    })

  if (uploadError) {
    console.error('Supabase storage upload error:', uploadError)
    return { success: false, error: 'Failed to upload file' }
  }

  const { error: markNotCurrentError } = await supabase
    .from('resumes')
    .update({ is_current: false })
    .eq('user_id', resolvedSupabaseUserId)

  if (markNotCurrentError) {
    console.error('Supabase resumes update error:', markNotCurrentError)
    await supabase.storage.from('resumes').remove([storagePath])
    return { success: false, error: 'Failed to save resume record' }
  }

  const { data: row, error: insertError } = await supabase
    .from('resumes')
    .insert({
      user_id: resolvedSupabaseUserId,
      storage_path: storagePath,
      filename: raw.name,
      file_type: raw.type.includes('pdf') ? 'pdf' : 'docx',
      is_current: true,
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('Supabase resumes insert error:', insertError)
    await supabase.storage.from('resumes').remove([storagePath])
    return { success: false, error: 'Failed to save resume record' }
  }

  return {
    success: true,
    storagePath,
    resumeId: String(row.id),
  }
}
