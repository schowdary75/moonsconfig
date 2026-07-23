import { describe, expect, it } from 'vitest';
import { protectedScreenAccessRequestSchema } from '../operations/protectedScreenOperations.js';

const request = {
  auth: {
    email: 'admin@example.com',
    sessionToken: 'a'.repeat(64),
  },
  screenKey: 'trending-2' as const,
  accessCode: '123456',
};

describe('protected screen access validation', () => {
  it('accepts a six-digit Trending-2 access request', () => {
    expect(protectedScreenAccessRequestSchema.safeParse(request).success).toBe(true);
  });

  it.each(['12345', '1234567', 'abc123'])('rejects invalid access code %s', (accessCode) => {
    expect(protectedScreenAccessRequestSchema.safeParse({ ...request, accessCode }).success).toBe(
      false,
    );
  });

  it('rejects access requests for other screens', () => {
    expect(
      protectedScreenAccessRequestSchema.safeParse({ ...request, screenKey: 'trending' }).success,
    ).toBe(false);
  });
});
