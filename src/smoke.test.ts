import { describe, it, expect } from 'vitest';
import { cusp } from './index';

describe('scaffold', () => {
  it('exports cusp as a function', () => {
    expect(typeof cusp).toBe('function');
  });
});
