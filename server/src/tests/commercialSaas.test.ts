import { describe, expect, it } from 'vitest';
import { COMMERCIAL_PLANS, calculatePlanAmount } from '../constants/commercialPlans.js';
import { requiredFeatureForOperation } from '../routes/operationRoutes.js';
import { normalizeTenantSlug, tenantDatabaseIdentifiers } from '../utils/tenantNaming.js';

describe('commercial SaaS invariants', () => {
  it('creates stable, safe and tenant-unique database identifiers', () => {
    const first = tenantDatabaseIdentifiers(
      'Ácme Tours & Travel!',
      'a1b2c3d4-0000-4000-8000-000000000000',
    );
    const second = tenantDatabaseIdentifiers(
      'Ácme Tours & Travel!',
      'deadbeef-0000-4000-8000-000000000000',
    );

    expect(first.databaseName).toBe('moonsconfig_acme_tours_travel_a1b2c3d4');
    expect(second.databaseName).not.toBe(first.databaseName);
    expect(first.databaseName).toMatch(/^[a-z0-9_]{1,64}$/);
    expect(first.databaseUsername).toMatch(/^[a-z0-9_]{1,64}$/);
    expect(normalizeTenantSlug('  Moon क Tours  ')).toBe('moon-tours');
  });

  it('prices included and additional seats for monthly and annual plans', () => {
    expect(calculatePlanAmount('starter', 'monthly', 2)).toBe(149_900);
    expect(calculatePlanAmount('starter', 'monthly', 5)).toBe(299_600);
    expect(calculatePlanAmount('business', 'annual', 12)).toBe(5_797_000);
    expect(() => calculatePlanAmount('starter', 'monthly', 6)).toThrow(/limits/i);
  });

  it('keeps Enterprise as a superset and maps direct legacy calls to plan features', () => {
    expect(COMMERCIAL_PLANS.enterprise.features).toEqual(
      expect.arrayContaining([...COMMERCIAL_PLANS.business.features]),
    );
    expect(COMMERCIAL_PLANS.business.features).toEqual(
      expect.arrayContaining([...COMMERCIAL_PLANS.starter.features]),
    );
    expect(requiredFeatureForOperation('adminAiSearchFlights')).toBe('visual_ai');
    expect(requiredFeatureForOperation('adminCreateVendor')).toBe('vendors');
    expect(requiredFeatureForOperation('adminCreateInvoice')).toBe('invoices');
    expect(requiredFeatureForOperation('adminGetCareers')).toBe('careers');
    expect(requiredFeatureForOperation('adminExportClients')).toBe('data_export');
  });
});
