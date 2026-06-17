const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export async function sendMessage(
  sessionId: string,
  message: string
): Promise<{ message: string; sessionId: string }> {
  try {
    // Backend expects POST /api/chat with body { message, sessionId }
    const response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        message,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`API error: ${response.status} ${text}`)
    }

    const data = await response.json()

    // Backend response shape: { response: string, sessionId, ... }
    return { message: data.response, sessionId: data.sessionId }
  } catch (error) {
    console.error('Error sending message:', error)
    throw error
  }
}

export async function checkHealth(): Promise<{ status: string }> {
  try {
    const response = await fetch(`${API_URL}/health`, {
      method: 'GET',
    })

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Health check error:', error)
    throw error
  }
}
