import { describe, expect, it } from 'vitest';
import { parseReply } from '../maya/brain.js';

describe('Maya reply parsing', () => {
  it('recovers JSON whose text contains literal line breaks', () => {
    const result = parseReply(`{"language":"en","text":"First package.

Second package."}`);

    expect(result).toEqual({
      language: 'en',
      text: 'First package.\n\nSecond package.',
    });
  });

  it('uses the verified tool fallback for an empty model response', () => {
    expect(parseReply('', 'Verified package result.').text).toBe('Verified package result.');
  });
});
