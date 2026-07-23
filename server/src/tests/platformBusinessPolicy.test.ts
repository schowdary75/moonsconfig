import { describe, expect, it } from 'vitest';
import {
  billingMayActivateWorkspace,
  confirmationMatches,
  operatorCan,
  recordIsFresh,
  validateCatalogHierarchy,
} from '../services/platformBusinessPolicy.js';

describe('platform business policy', () => {
  it('keeps role capabilities separated while allowing platform administrators everything', () => {
    expect(operatorCan('support', 'provisioning')).toBe(true);
    expect(operatorCan('support', 'billing')).toBe(false);
    expect(operatorCan('billing', 'billing')).toBe(true);
    expect(operatorCan('billing', 'identity_security')).toBe(false);
    expect(operatorCan('security', 'identity_security')).toBe(true);
    expect(operatorCan('security', 'lifecycle')).toBe(false);
    expect(operatorCan('platform_admin', 'lifecycle')).toBe(true);
    expect(operatorCan('platform_admin', 'billing')).toBe(true);
  });

  it('requires exact governed confirmation after harmless case and whitespace normalization', () => {
    expect(confirmationMatches('DELETE acme-tours', ' delete ACME-TOURS ')).toBe(true);
    expect(confirmationMatches('acme-tours', 'another-workspace')).toBe(false);
  });

  it('rejects stale optimistic concurrency timestamps', () => {
    const updatedAt = new Date('2026-07-19T12:00:00.000Z');
    expect(recordIsFresh(updatedAt, '2026-07-19T12:00:00.000Z')).toBe(true);
    expect(recordIsFresh(updatedAt, '2026-07-19T12:00:01.000Z')).toBe(false);
    expect(recordIsFresh(updatedAt, 'not-a-date')).toBe(false);
  });

  it('never lets a billing success remove an administrative hold', () => {
    expect(billingMayActivateWorkspace(null)).toBe(true);
    expect(billingMayActivateWorkspace(undefined)).toBe(true);
    expect(billingMayActivateWorkspace(new Date())).toBe(false);
  });

  it('requires monotonic versioned plan features and valid limits', () => {
    const plans = [
      {
        code: 'starter',
        includedSeats: 2,
        maxSeats: 5,
        storageBytes: 5,
        monthlyPricePaise: 100,
        annualPricePaise: 1000,
        entitlements: [{ featureKey: 'crm', enabled: true }],
      },
      {
        code: 'business',
        includedSeats: 10,
        maxSeats: 50,
        storageBytes: 50,
        monthlyPricePaise: 500,
        annualPricePaise: 5000,
        entitlements: [
          { featureKey: 'crm', enabled: true },
          { featureKey: 'billing', enabled: true },
        ],
      },
      {
        code: 'enterprise',
        includedSeats: 25,
        maxSeats: null,
        storageBytes: 250,
        monthlyPricePaise: 1500,
        annualPricePaise: null,
        entitlements: [
          { featureKey: 'crm', enabled: true },
          { featureKey: 'billing', enabled: true },
          { featureKey: 'sso', enabled: true },
        ],
      },
    ];
    expect(validateCatalogHierarchy(plans)).toEqual({ valid: true });
    plans[2]!.entitlements = [{ featureKey: 'crm', enabled: true }];
    expect(validateCatalogHierarchy(plans)).toEqual({
      valid: false,
      error: 'enterprise_missing:billing',
    });
  });
});
