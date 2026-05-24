# EasyBima Setup Guide

## Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- Anthropic API key
- Git

## 1. Clone & Install

```bash
git clone <repository-url>
cd easybima-chatbot/backend
npm install
```

## 2. Environment Configuration

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required variables:
- `ANTHROPIC_API_KEY` - Get from https://console.anthropic.com/
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `PORT` - Backend server port (default: 3001)

## 3. Database Setup

```bash
# Create database
createdb easybima

# Run schema & seed data
npm run db:setup
```

Or manually:
```bash
psql -d easybima -f backend/database/schema.sql
```

## 4. Start Development Server

```bash
npm run dev
```

Server runs at http://localhost:3001

## 5. Test the API

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, what insurance products do you offer?"}'
```

## 6. Frontend Setup

```bash
cd ../frontend
npm install
npm start
```

## Production Deployment

### Using Docker (Recommended)

```bash
docker-compose up -d
```

### Manual Deployment

1. Set `NODE_ENV=production`
2. Configure production database
3. Set up PM2 for process management:
   ```bash
   npm install -g pm2
   pm2 start server.js --name easybima-backend
   ```

### Environment Variables for Production

```env
NODE_ENV=production
PORT=3001
DB_SSL=true
RATE_LIMIT_MAX_REQUESTS=30
CLAUDE_MODEL=claude-3-sonnet-20240229
```

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running
- Check credentials in .env
- Ensure database exists: `createdb easybima`

### Anthropic API Errors
- Verify API key is valid
- Check rate limits on your Anthropic account
- Ensure sufficient credits

### CORS Issues
- Update CORS origin in server.js
- Ensure frontend domain is whitelisted