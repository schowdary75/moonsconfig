import { describe, expect, it } from 'vitest';
import { localRecoveryOptions } from '../maya/ontrip/localRecoveryOptions.js';
import { PERMANENTLY_APPROVAL_BOUND_ACTIONS } from '../maya/governance/policy.js';
import { classifySosIssue } from '../services/siteCompatibilityService.js';

describe('incident recovery safeguards', () => {
  it('offers UAE-specific transport services with official HTTPS links', () => {
    const options = localRecoveryOptions('transport_no_show', 'Dubai, UAE');
    expect(options.map((option) => option.name)).toEqual(
      expect.arrayContaining(['Careem', 'Dubai Taxi Company', 'Uber']),
    );
    expect(options.every((option) => option.bookingUrl.startsWith('https://'))).toBe(true);
  });

  it('offers hotel fallback search without inventing hotel availability', () => {
    const options = localRecoveryOptions('hotel_issue', 'Abu Dhabi, UAE');
    expect(options.map((option) => option.name)).toEqual(['Booking.com', 'Agoda']);
    expect(options.every((option) => option.kind === 'hotel')).toBe(true);
  });

  it('keeps incident reimbursement approval-bound', () => {
    expect(PERMANENTLY_APPROVAL_BOUND_ACTIONS.has('approve_incident_reimbursement')).toBe(true);
  });

  it('recognizes plain-language no-show messages without treating every hotel question as SOS', () => {
    expect(classifySosIssue('Our pickup driver is not here')).toBe('transport_no_show');
    expect(classifySosIssue('The hotel says there is no room')).toBe('hotel_issue');
    expect(classifySosIssue('Can you suggest a hotel in Dubai?')).toBeNull();
  });
});
