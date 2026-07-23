export const OPERATOR_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const OPERATOR_ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
export const OPERATOR_MFA_FRESH_MS = 10 * 60 * 1000;

export function operatorSessionIsActive(
  session: { lastSeenAt: Date; absoluteExpiresAt: Date; revokedAt?: Date | null },
  now = new Date(),
) {
  return (
    !session.revokedAt &&
    session.absoluteExpiresAt.getTime() > now.getTime() &&
    session.lastSeenAt.getTime() > now.getTime() - OPERATOR_IDLE_TIMEOUT_MS
  );
}

export function operatorMfaIsFresh(mfaVerifiedAt: Date | null | undefined, now = new Date()) {
  return Boolean(
    mfaVerifiedAt &&
    mfaVerifiedAt.getTime() <= now.getTime() &&
    now.getTime() - mfaVerifiedAt.getTime() <= OPERATOR_MFA_FRESH_MS,
  );
}
