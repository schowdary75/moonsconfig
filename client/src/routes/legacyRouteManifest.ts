import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';

type LegacyRouteModule = {
  Route: {
    options: {
      component?: ComponentType;
      loader?: (...args: any[]) => unknown;
      errorComponent?: ComponentType;
    };
  };
};

const lazyRoute = (importer: () => Promise<LegacyRouteModule>) => async () => {
  const module = await importer();
  const options = module.Route.options;
  if (!options.component) throw new Error('Legacy route has no component');
  return {
    Component: options.component,
    loader: options.loader,
    ErrorBoundary: options.errorComponent,
  };
};

export const LEGACY_AUTHENTICATED_ROUTE_COUNT = 51;

export const legacyAuthenticatedRoutes: RouteObject[] = [
  { path: 'onboarding', lazy: lazyRoute(() => import('./_authenticated/onboarding')) },
  {
    path: 'approvals',
    lazy: lazyRoute(() => import('./_authenticated/approvals')),
  },
  { path: 'assets', lazy: lazyRoute(() => import('./_authenticated/assets')) },
  {
    path: 'banners',
    lazy: lazyRoute(() => import('./_authenticated/banners')),
  },
  {
    path: 'bookings/all',
    lazy: lazyRoute(() => import('./_authenticated/bookings/all')),
  },
  {
    path: 'careers',
    lazy: lazyRoute(() => import('./_authenticated/careers')),
  },
  {
    path: 'cars',
    lazy: lazyRoute(() => import('./_authenticated/cars/index')),
  },
  {
    path: 'catalog',
    lazy: lazyRoute(() => import('./_authenticated/catalog')),
  },
  {
    path: 'command-center',
    lazy: lazyRoute(() => import('./_authenticated/command-center')),
  },
  {
    path: 'content/travelhub',
    lazy: lazyRoute(() => import('./_authenticated/content/travelhub')),
  },
  {
    path: 'content/visa',
    lazy: lazyRoute(() => import('./_authenticated/content/visa')),
  },
  {
    path: 'crm/clients/:id',
    lazy: lazyRoute(() => import('./_authenticated/crm/clients/$id')),
  },
  {
    path: 'crm/clients',
    lazy: lazyRoute(() => import('./_authenticated/crm/clients/index')),
  },
  {
    path: 'crm/pipeline',
    lazy: lazyRoute(() => import('./_authenticated/crm/pipeline')),
  },
  {
    path: 'crm/journey-manager',
    lazy: lazyRoute(() => import('./_authenticated/crm/journey-manager')),
  },
  {
    path: 'crm/incident-desk',
    lazy: lazyRoute(() => import('./_authenticated/crm/incident-desk')),
  },
  {
    path: 'cruises',
    lazy: lazyRoute(() => import('./_authenticated/cruises/index')),
  },
  {
    path: 'destinations',
    lazy: lazyRoute(() => import('./_authenticated/destinations/index')),
  },
  { path: 'escrow', lazy: lazyRoute(() => import('./_authenticated/escrow')) },
  { path: 'maya-ops', lazy: lazyRoute(() => import('./_authenticated/maya-ops')) },
  {
    path: 'experiences',
    lazy: lazyRoute(() => import('./_authenticated/experiences')),
  },
  {
    path: 'flights',
    lazy: lazyRoute(() => import('./_authenticated/flights/index')),
  },
  { index: true, lazy: lazyRoute(() => import('./_authenticated/index')) },
  {
    path: 'invoices',
    lazy: lazyRoute(() => import('./_authenticated/invoices')),
  },
  {
    path: 'leads/followups',
    lazy: lazyRoute(() => import('./_authenticated/leads/followups')),
  },
  {
    path: 'leads',
    lazy: lazyRoute(() => import('./_authenticated/leads/index')),
  },
  {
    path: 'marketing/audiences',
    lazy: lazyRoute(() => import('./_authenticated/marketing/audiences')),
  },
  {
    path: 'marketing/automations',
    lazy: lazyRoute(() => import('./_authenticated/marketing/automations')),
  },
  {
    path: 'marketing/campaigns/:campaignId',
    lazy: lazyRoute(() => import('./_authenticated/marketing/campaigns/$campaignId')),
  },
  {
    path: 'marketing/campaigns',
    lazy: lazyRoute(() => import('./_authenticated/marketing/campaigns/index')),
  },
  {
    path: 'mission-control',
    lazy: lazyRoute(() => import('./_authenticated/mission-control')),
  },
  {
    path: 'packages/:id',
    lazy: lazyRoute(() => import('./_authenticated/packages/$id')),
  },
  {
    path: 'packages',
    lazy: lazyRoute(() => import('./_authenticated/packages/index')),
  },
  {
    path: 'ppm/analytics',
    lazy: lazyRoute(() => import('./_authenticated/ppm/analytics')),
  },

  {
    path: 'ppm/visual-ai',
    lazy: lazyRoute(() => import('./_authenticated/ppm/visual-ai')),
  },
  {
    path: 'promo-codes',
    lazy: lazyRoute(() => import('./_authenticated/promo-codes')),
  },
  {
    path: 'promotions',
    lazy: lazyRoute(() => import('./_authenticated/promotions')),
  },
  {
    path: 'quotes',
    lazy: lazyRoute(() => import('./_authenticated/quotes/index')),
  },
  {
    path: 'refunds',
    lazy: lazyRoute(() => import('./_authenticated/refunds')),
  },
  {
    path: 'route-map',
    lazy: lazyRoute(() => import('./_authenticated/route-map')),
  },
  { path: 'seo', lazy: lazyRoute(() => import('./_authenticated/seo/index')) },
  {
    path: 'settings/billing',
    lazy: lazyRoute(() => import('./_authenticated/settings/billing')),
  },
  {
    path: 'settings/company-security',
    lazy: lazyRoute(() => import('./_authenticated/settings/company-security')),
  },
  {
    path: 'settings/email-templates',
    lazy: lazyRoute(() => import('./_authenticated/settings/email-templates')),
  },
  {
    path: 'settings/security',
    lazy: lazyRoute(() => import('./_authenticated/settings/security')),
  },
  {
    path: 'settings/users',
    lazy: lazyRoute(() => import('./_authenticated/settings/users')),
  },
  {
    path: 'stays',
    lazy: lazyRoute(() => import('./_authenticated/stays/index')),
  },
  { path: 'themes', lazy: lazyRoute(() => import('./_authenticated/themes')) },
  {
    path: 'trending',
    lazy: lazyRoute(() => import('./_authenticated/trending')),
  },
  {
    path: 'trending-2',
    lazy: lazyRoute(() => import('./_authenticated/trending-2')),
  },
  {
    path: 'vendors',
    lazy: lazyRoute(() => import('./_authenticated/vendors/index')),
  },
];
