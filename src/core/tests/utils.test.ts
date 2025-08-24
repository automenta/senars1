import { describe, it, expect } from 'vitest';
import { generate_embedding } from '../utils';

describe('Core Utils', () => {
  describe('generate_embedding', () => {
    it('should generate a vector of the specified length', () => {
      const embedding = generate_embedding('test', 16);
      expect(embedding).toBeInstanceOf(Array);
      expect(embedding.length).toBe(16);
    });

    it('should generate a deterministic embedding for the same content', () => {
      const embedding1 = generate_embedding('hello world');
      const embedding2 = generate_embedding('hello world');
      expect(embedding1).toEqual(embedding2);
    });

    it('should generate different embeddings for different content', () => {
      const embedding1 = generate_embedding('content a');
      const embedding2 = generate_embedding('content b');
      expect(embedding1).not.toEqual(embedding2);
    });

    it('should generate a normalized vector (magnitude approx 1)', () => {
      const embedding = generate_embedding('normalize me');
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1);
    });

    it('should handle empty strings', () => {
        const embedding = generate_embedding('');
        expect(embedding.length).toBe(16);
        expect(embedding.every(v => v === 0)).toBe(true);
    });
  });
});
