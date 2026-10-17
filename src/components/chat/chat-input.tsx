'use client'

import { useState, useRef, useEffect, useId } from 'react'

/** Sohbet metni yapay zekâ servisine gider; maskeleme yalnız yaygın kalıpları yakalar. */
export const CHAT_PERSONAL_DATA_NOTICE = 'Kişisel bilgilerini (ad-soyad, telefon, adres, okul, T.C. kimlik no, IBAN) yazma.'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({ onSend, disabled = false, placeholder = 'Sorunuzu yazin...' }: ChatInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const noticeId = useId()

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0'
    el.style.height = Math.min(el.scrollHeight, 100) + 'px'
  }, [value])

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-end gap-2 px-3 pb-1.5 pt-2.5">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-describedby={noticeId}
          rows={1}
          className="flex-1 resize-none bg-transparent text-xs text-[var(--text)] placeholder:text-[var(--text-sub)] focus:outline-none disabled:opacity-50"
          style={{ minHeight: '20px', maxHeight: '100px' }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--focus)] text-white transition-opacity hover:opacity-90 disabled:opacity-30"
          aria-label="Gonder"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
      <p id={noticeId} className="px-3 pb-2 text-[10px] leading-4 text-[var(--text-sub)]">
        {CHAT_PERSONAL_DATA_NOTICE}
      </p>
    </div>
  )
}
