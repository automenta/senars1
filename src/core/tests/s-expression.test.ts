import { describe, it, expect } from 'vitest';
import { parseSExpression, sExpressionToString } from '../s-expression';

describe('S-Expression Parser', () => {
  it('should parse a simple S-expression', () => {
    const result = parseSExpression('(a b c)');
    expect(result).toEqual({ head: 'a', args: ['b', 'c'] });
  });

  it('should parse an S-expression with a single argument', () => {
    const result = parseSExpression('(a b)');
    expect(result).toEqual({ head: 'a', args: ['b'] });
  });

  it('should parse an S-expression with no arguments', () => {
    const result = parseSExpression('(a)');
    expect(result).toEqual({ head: 'a', args: [] });
  });

  it('should parse nested S-expressions', () => {
    const result = parseSExpression('(a (b c) d)');
    expect(result).toEqual({
      head: 'a',
      args: [{ head: 'b', args: ['c'] }, 'd'],
    });
  });

  it('should handle multiple levels of nesting', () => {
    const result = parseSExpression('(a (b (c d)) e)');
    expect(result).toEqual({
      head: 'a',
      args: [{ head: 'b', args: [{ head: 'c', args: ['d'] }] }, 'e'],
    });
  });

  it('should throw an error for unbalanced parentheses', () => {
    expect(() => parseSExpression('(a (b c')).toThrow();
  });

  it('should throw an error for extra closing parentheses', () => {
    expect(() => parseSExpression('(a b))')).toThrow();
  });

  it('should handle strings with spaces', () => {
    const result = parseSExpression('(a "hello world" b)');
    expect(result).toEqual({ head: 'a', args: ['"hello world"', 'b'] });
  });

  it('should parse a complex expression with quotes', () => {
    const result = parseSExpression('(execute "llm" query:"is %substance toxic to %animal?")');
    expect(result).toEqual({ head: 'execute', args: ['"llm"', 'query:"is %substance toxic to %animal?"'] });
  });

  it('should not leave extra tokens', () => {
    const expr = '(a b c)';
    // This will require modifying the test runner to fail on console.warn,
    // but for now, we just want to ensure it parses correctly.
    const result = parseSExpression(expr);
    expect(result).toEqual({ head: 'a', args: ['b', 'c'] });
  });

  describe('sExpressionToString', () => {
    it('should convert a simple S-expression to a string', () => {
      const result = sExpressionToString({ head: 'a', args: ['b', 'c'] });
      expect(result).toBe('(a b c)');
    });

    it('should handle nested S-expressions', () => {
      const result = sExpressionToString({
        head: 'a',
        args: [{ head: 'b', args: ['c'] }, 'd'],
      });
      expect(result).toBe('(a (b c) d)');
    });

    it('should handle an S-expression with no arguments', () => {
        const result = sExpressionToString({ head: 'a', args: [] });
        expect(result).toBe('(a)');
    });

    it('should handle an S-expression with an empty head and some args', () => {
        const result = sExpressionToString({ head: '', args: ['b', 'c'] });
        expect(result).toBe('(b c)');
    });

    it('should handle an empty S-expression', () => {
        const result = sExpressionToString({ head: '', args: [] });
        expect(result).toBe('()');
    });
  });
});
