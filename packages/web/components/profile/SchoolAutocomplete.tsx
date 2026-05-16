'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

type University = {
  name: string
  country: string
  domains?: string[]
  web_pages?: string[]
}

interface SchoolAutocompleteProps {
  id: string
  value: string
  onChange: (next: string) => void
  onCommit: (next: string) => void
  placeholder?: string
}

export function SchoolAutocomplete({
  id,
  value,
  onChange,
  onCommit,
  placeholder = 'University of Alabama',
}: SchoolAutocompleteProps) {
  const universitiesRef = useRef<University[]>([])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [results, setResults] = useState<University[]>([])
  const [totalMatches, setTotalMatches] = useState(0)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)

  useEffect(() => {
    fetch('/universities.json')
      .then((response) => {
        if (response.ok) return response.json() as Promise<University[]>
        return fetch('/world_universities_and_domains.json').then((fallback) =>
          fallback.ok ? (fallback.json() as Promise<University[]>) : [],
        )
      })
      .then((data) => {
        universitiesRef.current = Array.isArray(data) ? data : []
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [])

  useEffect(() => {
    const query = value.trim().toLowerCase()
    if (query.length <= 2) {
      setResults([])
      setTotalMatches(0)
      setOpen(false)
      setHighlight(-1)
      return
    }
    const matches = universitiesRef.current
      .filter((u) => u.name.toLowerCase().includes(query))
      .sort((a, b) => {
        const aUS = a.country === 'United States' ? 0 : 1
        const bUS = b.country === 'United States' ? 0 : 1
        return aUS - bUS || a.name.localeCompare(b.name)
      })
    const top = matches.slice(0, 20)
    setTotalMatches(matches.length)
    setResults(top)
    setOpen(top.length > 0)
    setHighlight(top.length > 0 ? 0 : -1)
  }, [value])

  const select = (school: string) => {
    onChange(school)
    setOpen(false)
    setHighlight(-1)
    onCommit(school)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) {
      if (event.key === 'Escape') {
        setOpen(false)
        setHighlight(-1)
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((prev) => (prev < results.length - 1 ? prev + 1 : 0))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((prev) => (prev > 0 ? prev - 1 : results.length - 1))
      return
    }
    if (event.key === 'Enter') {
      if (highlight >= 0 && highlight < results.length) {
        event.preventDefault()
        select(results[highlight].name)
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      setHighlight(-1)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          if (value.trim().length > 2 && results.length > 0) {
            setOpen(true)
            setHighlight(0)
          }
        }}
        onBlur={() => onCommit(value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="organization"
        className="font-body w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-[#555] backdrop-blur-md transition-all duration-200 focus:border-[#FF6733]/60 focus:bg-white/[0.05] focus:shadow-[0_0_24px_rgba(255,103,51,0.18)] focus:outline-none"
      />
      {open && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
          {totalMatches > 20 && (
            <div className="border-b border-white/10 px-4 py-2 text-xs text-[#555]">
              Showing 20 of {totalMatches} matches — type more to narrow down
            </div>
          )}
          <div
            className="max-h-48 overflow-y-auto"
            style={{ scrollbarWidth: 'thin' }}
          >
            {results.map((result, index) => (
              <button
                key={`${result.name}-${result.country}`}
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(event) => {
                  event.preventDefault()
                  select(result.name)
                }}
                className={cn(
                  'w-full cursor-pointer px-4 py-2 text-left',
                  highlight === index ? 'bg-white/10' : 'hover:bg-white/5',
                )}
              >
                <div className="text-sm text-white">{result.name}</div>
                <div className="text-xs text-[#888]">{result.country}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
