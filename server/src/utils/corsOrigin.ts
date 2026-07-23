import { env } from '../config/env.js';

export function isCorsOriginAllowed(origin: string | undefined): boolean {
  if (!origin || env.corsOrigins.includes(origin)) return true;

  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    const baseDomain = env.appBaseDomain.toLowerCase();
    const isTenantHost = hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
    const isSafeProtocol =
      url.protocol === 'https:' || (env.nodeEnv !== 'production' && url.protocol === 'http:');

    return isTenantHost && isSafeProtocol;
  } catch {
    return false;
  }
}
