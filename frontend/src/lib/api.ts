// Fix: append /api to the base URL so all requests route correctly.
// NEXT_PUBLIC_API_URL should be set to http://localhost:3001 (no trailing slash, no /api).
const API_BASE = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api`;

export async function sendMessage(sessionId: string, message: string) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
  });

  if (!response.ok) {
    const error = new Error('Failed to send message') as any;
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function keepAliveSession(sessionId: string) {
  const response = await fetch(`${API_BASE}/chat/keep-alive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) throw new Error('Keep-alive failed');
  return response.json();
}

export async function endSession(sessionId: string) {
  const response = await fetch(`${API_BASE}/chat/end-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) throw new Error('Failed to end session');
  return response.json();
}

export async function getConversationHistory(sessionId: string) {
  const response = await fetch(`${API_BASE}/chat/conversation/${sessionId}`);

  if (response.status === 410) {
    const error = new Error('Session expired') as any;
    error.status = 410;
    throw error;
  }

  if (!response.ok) throw new Error('Failed to fetch history');
  return response.json();
}

export interface TicketStatusResponse {
  hasActiveTicket: boolean;
  ticketNumber: string | null;
  ticketStatus: string | null;
  ticketCreatedAt: string | null;
  assignedAgent: { id: string; name: string } | null;
}

// Lightweight poll used while a ticket is open so the widget picks up
// staff-side changes (agent accepts, agent closes/resolves) even if the
// customer hasn't sent a new message since.
export async function getTicketStatus(sessionId: string): Promise<TicketStatusResponse> {
  const response = await fetch(`${API_BASE}/chat/ticket/${sessionId}`);
  if (!response.ok) throw new Error('Failed to fetch ticket status');
  return response.json();
}

// Customer-initiated permanent close of their own open ticket.
export async function closeTicket(sessionId: string): Promise<{ success: boolean; ticketNumber: string; ticketStatus: string }> {
  const response = await fetch(`${API_BASE}/chat/ticket/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.message || 'Failed to close ticket') as any;
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export interface SubmitContactInfoResponse {
  success: boolean;
  ticketNumber: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
}

/**
 * Sends whatever contact details the customer entered in the "How can we
 * reach you?" prompt to the backend, which attaches them to the session's
 * currently open ticket. At least one of email/phone must be set (enforced
 * server-side too).
 */
export async function submitContactInfo(
  sessionId: string,
  contact: { name?: string; email?: string; phone?: string }
): Promise<SubmitContactInfoResponse> {
  const response = await fetch(`${API_BASE}/chat/contact-info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, ...contact }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.message || 'Failed to submit contact info') as any;
    error.status = response.status;
    error.code = body.error;
    throw error;
  }
  return response.json();
}