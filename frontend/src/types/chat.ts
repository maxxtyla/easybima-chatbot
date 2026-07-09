export type MessageRole = 'user' | 'assistant' | 'agent'

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  isLoading?: boolean
}

export interface ChatResponse {
  id: string
  message: string
  sessionId: string
  timestamp: number
}

export interface ChatState {
  messages: Message[]
  isLoading: boolean
  sessionId: string
  isOpen: boolean
}

export interface QuickQuestion {
  id: string
  text: string
  icon?: string
}
