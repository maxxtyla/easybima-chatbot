# EasyBima API Reference

## Base URL
```
Development: http://localhost:3001
Production: https://api.cicinsurancegroup.com
```

## Authentication
No authentication required for chat endpoint (rate-limited by IP).

## Endpoints

### POST /api/chat
Send a message to the chatbot.

**Request:**
```json
{
  "message": "What motor insurance options do you have?",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "response": "Karibu! CIC offers several motor insurance options...",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "escalation": false,
  "sentiment": "neutral",
  "suggestions": [
    "Get a motor quote",
    "Compare motor covers",
    "Motor claim process"
  ],
  "timestamp": "2024-01-15T10:30:00.000Z",
  "responseTime": 1250
}
```

**Error Response:**
```json
{
  "error": "Message is required",
  "code": "MISSING_MESSAGE"
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "EasyBima Backend",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0"
}
```

### GET /api/chat/health
Chat service health check.

**Response:**
```json
{
  "status": "ok",
  "service": "Chat API",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Error Codes

| Code | Description |
|------|-------------|
| MISSING_MESSAGE | Request body missing message field |
| EMPTY_MESSAGE | Message is empty or whitespace only |
| MESSAGE_TOO_LONG | Message exceeds 2000 characters |
| SUSPICIOUS_INPUT | Potentially malicious input detected |
| RATE_LIMIT_EXCEEDED | Too many requests from this IP |
| AI_SERVICE_ERROR | Claude API unavailable |
| DB_ERROR | Database connection issue |
| INTERNAL_ERROR | Unexpected server error |

## Rate Limits

- 30 requests per minute per IP address
- Rate limit headers included in response:
  - `X-RateLimit-Limit`: 30
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Unix timestamp when limit resets

## Session Management

- Sessions are identified by UUID v4
- Session IDs should be stored in client localStorage
- Sessions expire after 30 minutes of inactivity
- Maximum 50 messages stored per conversation

## CORS

Allowed origins (production):
- https://cicinsurancegroup.com
- https://www.cicinsurancegroup.com

Allowed methods: GET, POST
Allowed headers: Content-Type, Authorization