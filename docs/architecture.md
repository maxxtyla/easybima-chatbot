# EasyBima AI Chatbot - Architecture Documentation

## System Overview

EasyBima is an AI-powered chatbot for CIC Insurance Group that provides customer support, product information, and policy guidance through natural language conversations.

## Architecture Diagram

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Backend API    │────▶│   Anthropic    │
│  (React Widget) │◀────│   (Express.js)   │◀────│   Claude API   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌──────────────────┐
                        │   PostgreSQL     │
                        │   (Chat History, │
                        │   FAQ, Products) │
                        └──────────────────┘
```

## Components

### 1. Frontend (React Widget)
- **ChatWidget.jsx**: Floating button that opens chat window
- **ChatWindow.jsx**: Main chat interface container
- **MessageList.jsx**: Renders chat bubbles with timestamps
- **InputBar.jsx**: Text input with send button
- **QuickQuestions.jsx**: Suggestion chips for common queries

### 2. Backend (Express.js)
- **server.js**: Entry point, middleware setup
- **routes/chat.js**: API endpoint definitions
- **controllers/chatController.js**: Request orchestration
- **services/**: Business logic layer
  - *claudeService.js*: Anthropic API integration
  - *conversationService.js*: Session & history management
  - *policyService.js*: FAQ search, product recommendations
- **middleware/**: Cross-cutting concerns
  - *validateInput.js*: Input sanitization
  - *rateLimiter.js*: Request throttling
  - *errorHandler.js*: Global error handling

### 3. Database (PostgreSQL)
- **conversations**: Session storage & message history
- **messages**: Detailed message log for analytics
- **faq_entries**: Knowledge base for quick lookups
- **products**: Product catalog reference
- **branches**: Branch location data
- **chat_analytics**: Usage metrics & events

### 4. External Services
- **Anthropic Claude**: AI language model for natural responses
- **CIC APIs** (future): Real-time policy & claims data

## Data Flow

1. User sends message via frontend widget
2. Frontend sends POST /api/chat with message + sessionId
3. Backend validates input & checks rate limits
4. Backend retrieves conversation history from Postgres
5. Backend searches FAQ/products for relevant context
6. Backend calls Claude API with system prompt + context
7. Backend saves conversation & logs analytics
8. Backend returns AI response + suggestions to frontend
9. Frontend renders response with typing indicator

## Security Considerations

- Input sanitization (HTML stripping, length limits)
- Rate limiting (30 req/min per IP)
- CORS configuration (whitelist domains)
- Helmet.js security headers
- Environment variables for secrets
- No PII in logs or responses

## Scalability

- Stateless backend (horizontally scalable)
- PostgreSQL connection pooling
- Conversation history capped at 50 messages
- CDN for static frontend assets
- Redis caching layer (future enhancement)

## Monitoring

- Health check endpoint (/health)
- Response time logging
- Error tracking with Sentry
- Analytics dashboard (conversation metrics)
- Escalation rate tracking