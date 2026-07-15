'use client'

import { FileText, Loader2, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  deleteTranscript,
  getTranscript,
  uploadTranscript,
  type TranscriptInfo,
} from '@/app/actions/transcript'
import { useToast } from '@/hooks/use-toast'

/**
 * Unofficial-transcript uploader for the profile page. Some university /
 * new-grad postings require a transcript upload; the Scout Agent attaches
 * this file when a form asks for one, and without it those applications
 * stop with "needs attention" instead of submitting.
 */
export function TranscriptUpload() {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [transcript, setTranscript] = useState<TranscriptInfo | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getTranscript().then((info) => {
      if (!cancelled) {
        setTranscript(info)
        setLoaded(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleFile = async (file: File) => {
    setBusy(true)
    try {
      const formData = new FormData()
      formData.set('file', file)
      const result = await uploadTranscript(formData)
      if (result.success) {
        setTranscript(result.transcript)
        toast({
          title: 'Transcript saved',
          description: 'Scout will attach it when an application asks for one.',
        })
      } else {
        toast({
          title: 'Upload failed',
          description: result.error,
          variant: 'destructive',
        })
      }
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    setBusy(true)
    try {
      const result = await deleteTranscript()
      if (result.success) {
        setTranscript(null)
        toast({ title: 'Transcript removed' })
      } else {
        toast({
          title: 'Could not remove transcript',
          description: result.error,
          variant: 'destructive',
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />

      {!loaded ? (
        <div className="h-[52px] animate-pulse rounded-xl bg-white/[0.04]" />
      ) : transcript ? (
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
          <FileText className="h-4 w-4 shrink-0 text-[#22c55e]" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-white">{transcript.filename}</p>
            <p className="text-xs text-[#555]">
              {transcript.uploadedAt
                ? `Uploaded ${new Date(transcript.uploadedAt).toLocaleDateString()}`
                : 'Uploaded'}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="shrink-0 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-[#888] transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
          >
            Replace
          </button>
          <button
            type="button"
            aria-label="Remove transcript"
            disabled={busy}
            onClick={() => void handleRemove()}
            className="shrink-0 rounded-lg p-1.5 text-[#555] transition-colors hover:bg-white/[0.06] hover:text-[#ef4444] disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            )}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] px-4 py-3.5 text-sm text-[#888] transition-colors hover:border-primary/40 hover:text-white disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" strokeWidth={1.75} />
          )}
          {busy ? 'Uploading…' : 'Upload unofficial transcript (PDF)'}
        </button>
      )}
    </div>
  )
}
