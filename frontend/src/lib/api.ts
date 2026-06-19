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