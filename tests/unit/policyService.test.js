const { searchFAQ, getProducts, findBranches, getRecommendation, getQuickFact } = require('../../backend/services/policyService');
const { query } = require('../../backend/config/database');

// Mock database
jest.mock('../../backend/config/database', () => ({
  query: jest.fn(),
}));

describe('Policy Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('searchFAQ', () => {
    it('should return matching FAQ entries', async () => {
      const mockFAQs = [
        { id: 1, question: 'What is CIC?', answer: 'CIC is an insurance company', relevance: 5 },
      ];
      query.mockResolvedValue({ rows: mockFAQs });

      const result = await searchFAQ('what is cic');
      expect(result).toEqual(mockFAQs);
      expect(query).toHaveBeenCalled();
    });

    it('should return empty array for short queries', async () => {
      const result = await searchFAQ('a');
      expect(result).toEqual([]);
      expect(query).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      query.mockRejectedValue(new Error('DB error'));
      const result = await searchFAQ('motor insurance');
      expect(result).toEqual([]);
    });
  });

  describe('getProducts', () => {
    it('should return products by category', async () => {
      const mockProducts = [
        { id: 1, name: 'Private Motor', category: 'Motor' },
      ];
      query.mockResolvedValue({ rows: mockProducts });

      const result = await getProducts('Motor');
      expect(result).toEqual(mockProducts);
    });

    it('should return all active products when no filters', async () => {
      query.mockResolvedValue({ rows: [] });
      await getProducts();
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM products WHERE is_active = true'),
        []
      );
    });
  });

  describe('findBranches', () => {
    it('should return branches by city', async () => {
      const mockBranches = [
        { id: 1, name: 'Nairobi Branch', city: 'Nairobi' },
      ];
      query.mockResolvedValue({ rows: mockBranches });

      const result = await findBranches('Nairobi');
      expect(result).toEqual(mockBranches);
    });
  });

  describe('getRecommendation', () => {
    it('should recommend motor products for car queries', async () => {
      query.mockResolvedValue({ rows: [{ name: 'Private Motor Comprehensive' }] });
      const result = await getRecommendation('I need car insurance');
      expect(result.category).toBe('Motor');
    });

    it('should recommend medical products for health queries', async () => {
      query.mockResolvedValue({ rows: [{ name: 'Family Medisure' }] });
      const result = await getRecommendation('health insurance');
      expect(result.category).toBe('Medical');
    });

    it('should return general recommendations for unknown queries', async () => {
      const result = await getRecommendation('something random');
      expect(result.category).toBe('General');
    });
  });

  describe('getQuickFact', () => {
    it('should return history fact for history queries', async () => {
      const result = await getQuickFact('history');
      expect(result).toContain('1968');
    });

    it('should return default response for unknown topics', async () => {
      const result = await getQuickFact('xyzabc');
      expect(result).toContain('CIC Insurance Group');
    });
  });
});