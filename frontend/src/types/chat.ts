export type MessageRole = 'user' | 'assistant' | 'agent' | 'system'

export type TicketStatus = 'open' | 'assigned' | 'in_progress' | 'pending_customer' | 'resolved' | 'closed'

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

export interface AssignedAgent {
  id: string
  name: string
}

export interface TicketData {
  ticketNumber: string | null
  status: TicketStatus
  createdAt: string
  assignedAgent: AssignedAgent | null
}

export interface ChatState {
  messages: Message[]
  isLoading: boolean
  sessionId: string
  isOpen: boolean
  ticketNumber?: string | null
  ticketStatus?: TicketStatus
  ticketCreatedAt?: string
  assignedAgent?: AssignedAgent | null
}

export interface QuickQuestion {
  id: string
  text: string
  icon?: string
}
