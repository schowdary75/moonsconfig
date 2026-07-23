import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/healthService.js', () => ({
  getHealth: vi.fn().mockResolvedValue({
    status: 'ok',
    version: '1.0.0',
    uptime: 1,
    services: { database: 'up', redis: 'up', socket: 'disabled' },
  }),
}));
const { createApp } = await import('../app.js');

describe('health API', () => {
  it('returns the standard success envelope', async () => {
    const response = await request(createApp()).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { status: 'ok' } });
    expect(response.headers['x-request-id']).toBeTruthy();
  });
});
