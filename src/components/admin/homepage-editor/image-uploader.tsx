'use client'

import { useCallback, useRef, useState } from 'react'

interface ImageUploaderProps {
  value?: string
  onChange: (url: string) => void
}

export function ImageUploader({ value, onChange }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validate = (file: File): string | null => {
    if (file.type !== 'image/png') return 'Sadece PNG dosyaları kabul edilir.'
    if (file.size > 2 * 1024 * 1024) return 'Dosya boyutu maksimum 2MB olmalıdır.'
    return null
  }

  const upload = useCallback(
    async (file: File) => {
      const validationError = validate(file)
      if (validationError) {
        setError(validationError)
        return
      }
      setError(null)
      setIsUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/admin/homepage/upload', {
          method: 'POST',
          body: formData,
        })
        if (!res.ok) throw new Error('Yükleme başarısız')
        const data = await res.json()
        onChange(data.url)
      } catch {
        setError('Dosya yüklenirken hata oluştu.')
      } finally {
        setIsUploading(false)
      }
    },
    [onChange]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) upload(file)
    },
    [upload]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) upload(file)
    },
    [upload]
  )

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer
          transition-all duration-200 text-center
          ${
            isDragging
              ? 'border-[var(--focus)] bg-[var(--focus-bg)]'
              : 'border-[var(--border)] hover:border-[var(--focus-border)] hover:bg-[var(--bg)]'
          }
        `}
      >
        {isUploading ? (
          <div className="flex items-center gap-2 text-[var(--focus)]">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-sm font-medium">Yükleniyor...</span>
          </div>
        ) : (
          <>
            <span className="text-3xl">📤</span>
            <p className="text-sm text-[var(--text-sub)]">PNG dosya sürükle veya tıkla</p>
            <p className="text-xs text-[var(--text-sub)] opacity-60">Maks 2MB</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {error && (
        <p className="text-xs text-[var(--urgency)] px-1">{error}</p>
      )}

      {value && (
        <div className="relative rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2">
          <img
            src={value}
            alt="Yüklenen görsel"
            className="max-h-32 mx-auto rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  )
}
