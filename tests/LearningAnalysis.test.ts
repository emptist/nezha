import { LearningAnalysisService } from '../src/core/LearningAnalysis';
import { DatabaseClient } from '../src/db/DatabaseClient';

// Mock database client
const mockDb = {
  query: jest.fn(),
} as unknown as DatabaseClient;

const learningService = new LearningAnalysisService(mockDb);

describe('LearningAnalysisService - getPatternsByCategory', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return patterns filtered by category and success rate', async () => {
    const mockPatterns = [
      {
        id: '1',
        patternCategory: 'network',
        successRate: 0.9,
        patternContent: 'Pattern 1',
      },
      {
        id: '2',
        patternCategory: 'network',
        successRate: 0.8,
        patternContent: 'Pattern 2',
      },
    ];

    mockDb.query.mockResolvedValueOnce({ rows: mockPatterns });

    const result = await learningService.getPatternsByCategory('network', 0.8);

    expect(result).toHaveLength(2);
    expect(result[0].patternContent).toBe('Pattern 1');
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.any(String),
      ['network', 0.8, 10]
    );
  });

  it('should handle no matching patterns', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const result = await learningService.getPatternsByCategory('unknown', 0.8);

    expect(result).toHaveLength(0);
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.any(String),
      ['unknown', 0.8, 10]
    );
  });

  it('should handle custom limit parameter', async () => {
    const mockPatterns = [
      {
        id: '1',
        patternCategory: 'api',
        successRate: 0.9,
        patternContent: 'API Pattern',
      },
    ];

    mockDb.query.mockResolvedValueOnce({ rows: mockPatterns });

    const result = await learningService.getPatternsByCategory('api', 0.7, 5);

    expect(result).toHaveLength(1);
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.any(String),
      ['api', 0.7, 5]
    );
  });
});