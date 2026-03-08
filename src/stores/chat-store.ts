import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface ChatStore {
  messages: ChatMessage[]
  isOpen: boolean
  isLoading: boolean
  // Mevcut soru context'i — quiz engine set eder
  questionContext: string | null

  toggleOpen: () => void
  setOpen: (open: boolean) => void
  addMessage: (role: 'user' | 'assistant', content: string) => void
  updateLastAssistant: (content: string) => void
  setLoading: (loading: boolean) => void
  setQuestionContext: (ctx: string | null) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isOpen: false,
  isLoading: false,
  questionContext: null,

  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),

  addMessage: (role, content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: Date.now().toString(), role, content, timestamp: Date.now() },
      ],
    })),

  updateLastAssistant: (content) =>
    set((s) => {
      const msgs = [...s.messages]
      const lastIdx = msgs.findLastIndex((m) => m.role === 'assistant')
      if (lastIdx >= 0) {
        msgs[lastIdx] = { ...msgs[lastIdx], content }
      }
      return { messages: msgs }
    }),

  setLoading: (loading) => set({ isLoading: loading }),
  setQuestionContext: (ctx) => set({ questionContext: ctx }),
  clearMessages: () => set({ messages: [] }),
}))
