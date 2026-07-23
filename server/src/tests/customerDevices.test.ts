import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { registerDevice, removeDevice } = vi.hoisted(() => ({
  registerDevice: vi.fn().mockResolvedValue({ registered: true }),
  removeDevice: vi.fn().mockResolvedValue(null),
}));

vi.mock('../middlewares/authenticate.js', () => ({
  authenticate: (req: { auth?: unknown }, _res: unknown, next: () => void) => {
    req.auth = {
      userId: 7,
      principalType: 'customer_user',
      sessionId: 'customer-test',
      legacy: false,
    };
    next();
  },
  authenticateOptional: (_req: unknown, _res: unknown, next: () => void) => next(),
  authorize: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../services/customerService.js', () => ({
  customerService: {
    registerDevice,
    removeDevice,
  },
}));

const { createApp } = await import('../app.js');

describe('customer device API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers a validated native push token for the authenticated customer', async () => {
    const input = {
      token: 'fcm-token-with-more-than-sixteen-characters',
      platform: 'android',
      appVersion: '1.1.0',
    };
    const response = await request(createApp()).post('/api/v1/customer/devices').send(input);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { registered: true } });
    expect(registerDevice).toHaveBeenCalledWith(7, input);
  });

  it('rejects unsupported device platforms', async () => {
    const response = await request(createApp()).post('/api/v1/customer/devices').send({
      token: 'push-token-with-more-than-sixteen-characters',
      platform: 'desktop',
    });

    expect(response.status).toBe(400);
    expect(registerDevice).not.toHaveBeenCalled();
  });

  it('removes only the authenticated customer device token', async () => {
    const token = 'apns-token-with-more-than-sixteen-characters';
    const response = await request(createApp()).delete(
      `/api/v1/customer/devices/${encodeURIComponent(token)}`,
    );

    expect(response.status).toBe(200);
    expect(removeDevice).toHaveBeenCalledWith(7, token);
  });
});
