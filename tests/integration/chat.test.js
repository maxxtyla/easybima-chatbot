const request = require('supertest');
const app = require('../../backend/server');

// Mock Anthropic
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ text: 'Hello! I am Bima from CIC Insurance. How can I help you today?' }],
      }),
    },
  }));
});

// Mock database
jest.mock('../../backend/config/database', () => ({
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn(),
    }),
    end: jest.fn(),
  },
  query: jest.fn().mockResolvedValue({ rows: [] }),
  transaction: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
}));

describe('Chat API Integration Tests', () => {
  describe('POST /api/chat', () => {
    it('should return a response for valid message', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'Hello' })
        .expect(200);

      expect(response.body).toHaveProperty('response');
      expect(response.body).toHaveProperty('sessionId');
      expect(response.body.escalation).toBe(false);
      expect(response.body).toHaveProperty('suggestions');
    });

    it('should create a new session if none provided', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'Hi there' })
        .expect(200);

      expect(response.body.sessionId).toBeDefined();
      expect(response.body.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should maintain session across requests', async () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440000';

      const response1 = await request(app)
        .post('/api/chat')
        .send({ message: 'First message', sessionId })
        .expect(200);

      expect(response1.body.sessionId).toBe(sessionId);
    });

    it('should handle escalation triggers', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'I want to speak to a human agent' })
        .expect(200);

      expect(response.body.escalation).toBe(true);
      expect(response.body.response).toContain('human agent');
    });

    it('should return 400 for missing message', async () => {
      await request(app)
        .post('/api/chat')
        .send({})
        .expect(400);
    });

    it('should return 400 for empty message', async () => {
      await request(app)
        .post('/api/chat')
        .send({ message: '   ' })
        .expect(400);
    });

    it('should return 400 for message too long', async () => {
      const longMessage = 'a'.repeat(2001);
      await request(app)
        .post('/api/chat')
        .send({ message: longMessage })
        .expect(400);
    });

    it('should handle suspicious input', async () => {
      await request(app)
        .post('/api/chat')
        .send({ message: '<script>alert("xss")</script>' })
        .expect(400);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
    });
  });

  describe('Rate Limiting', () => {
    it('should limit excessive requests', async () => {
      // Make 31 requests (limit is 30)
      for (let i = 0; i < 31; i++) {
        const response = await request(app)
          .post('/api/chat')
          .send({ message: `Message ${i}` });

        if (i === 30) {
          expect(response.status).toBe(429);
        }
      }
    });
  });
});