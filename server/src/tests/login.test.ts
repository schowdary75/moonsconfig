import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/authService.js', () => ({
  authService: {
    login: vi.fn().mockResolvedValue({
      refreshToken: 'opaque-refresh',
      session: {
        accessToken: 'access.jwt.token',
        expiresIn: 900,
        user: { id: 1, email: 'owner@example.com', role: 'admin', roles: ['admin'] },
      },
    }),
    refresh: vi.fn(),
    exchangeLegacy: vi.fn(),
    logout: vi.fn(),
    getUser: vi.fn(),
  },
}));
const { createApp } = await import('../app.js');

describe('login API', () => {
  it('validates and authenticates without exposing the refresh token', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email: 'owner@example.com', password: 'correct-password' });
    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBe('access.jwt.token');
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');
  });

  it('rejects invalid input', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email: 'invalid', password: '' });
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
});
