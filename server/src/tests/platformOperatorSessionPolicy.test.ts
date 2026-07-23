import { describe, expect, it } from 'vitest';
import {
  OPERATOR_ABSOLUTE_TIMEOUT_MS,
  OPERATOR_IDLE_TIMEOUT_MS,
  OPERATOR_MFA_FRESH_MS,
  operatorMfaIsFresh,
  operatorSessionIsActive,
} from '../services/platformOperatorSessionPolicy.js';

const now = new Date('2026-07-19T12:00:00.000Z');

describe('platform operator session policy', () => {
  it('keeps an active session inside both timeout windows', () => {
    expect(
      operatorSessionIsActive(
        {
          lastSeenAt: new Date(now.getTime() - OPERATOR_IDLE_TIMEOUT_MS + 1),
          absoluteExpiresAt: new Date(now.getTime() + 1),
        },
        now,
      ),
    ).toBe(true);
  });

  it('expires idle, absolute, and revoked sessions', () => {
    expect(
      operatorSessionIsActive(
        { lastSeenAt: new Date(now.getTime() - OPERATOR_IDLE_TIMEOUT_MS), absoluteExpiresAt: now },
        now,
      ),
    ).toBe(false);
    expect(
      operatorSessionIsActive(
        {
          lastSeenAt: now,
          absoluteExpiresAt: new Date(now.getTime() + OPERATOR_ABSOLUTE_TIMEOUT_MS),
          revokedAt: now,
        },
        now,
      ),
    ).toBe(false);
  });

  it('requires step-up after ten minutes', () => {
    expect(operatorMfaIsFresh(new Date(now.getTime() - OPERATOR_MFA_FRESH_MS), now)).toBe(true);
    expect(operatorMfaIsFresh(new Date(now.getTime() - OPERATOR_MFA_FRESH_MS - 1), now)).toBe(
      false,
    );
  });
});
