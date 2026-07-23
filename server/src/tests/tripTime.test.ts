import { describe, expect, it } from 'vitest';
import { tripDayNumber, tripPhase } from '../utils/tripTime.js';

describe('trip time calculations', () => {
  const travelDate = new Date('2026-07-20T00:00:00.000Z');

  it('uses the tenant timezone at a calendar-day boundary', () => {
    const now = new Date('2026-07-19T18:31:00.000Z');
    expect(tripDayNumber(travelDate, 'Asia/Kolkata', now)).toBe(1);
    expect(tripDayNumber(travelDate, 'America/New_York', now)).toBe(0);
  });

  it('falls back safely when a configured timezone is invalid', () => {
    const now = new Date('2026-07-19T18:31:00.000Z');
    expect(tripDayNumber(travelDate, 'Not/A-Timezone', now)).toBe(1);
  });

  it('separates inactive, upcoming, active, and completed phases', () => {
    expect(tripPhase('cancelled', 1, 5)).toBe('inactive');
    expect(tripPhase('confirmed', 0, 5)).toBe('upcoming');
    expect(tripPhase('confirmed', 3, 5)).toBe('active');
    expect(tripPhase('confirmed', 6, 5)).toBe('completed');
  });
});
