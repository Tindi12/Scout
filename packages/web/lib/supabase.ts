import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Surface a clear error during build/runtime if env is missing.
  // RLS protects the data; the anon key is safe in the browser.
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env var.',
  )
}

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})
