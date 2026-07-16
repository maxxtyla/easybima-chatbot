export type MessageRole = 'user' | 'assistant' | 'agent' | 'system'

export type TicketStatus = 'open' | 'assigned' | 'in_progress' | 'pending_customer' | 'resolved' | 'closed'

export interface ReplySnippet {
  id: string
  role: MessageRole
  content: string
}

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  isLoading?: boolean
  /** Present when this message was sent as a reply to an earlier one. */
  replyTo?: ReplySnippet
  /** For role 'agent' — the name of the live agent who sent this reply,
   *  snapshotted at the time the message arrived so the widget can show
   *  "Jane" instead of a generic "Live agent" label. */
  agentName?: string
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

/** Icon keys rendered by <QuickLinkIcon>. Kept as a closed set so the
 *  editor can offer a picker instead of a free-text field. */
export type QuickLinkIconKey =
  | 'calendar'
  | 'wallet'
  | 'shield'
  | 'lifebuoy'
  | 'link'
  | 'phone'
  | 'mail'
  | 'file'
  | 'home'
  | 'star'

export interface QuickLink {
  id: string
  label: string
  url: string
  icon: QuickLinkIconKey
}