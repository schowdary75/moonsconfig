import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/customerAuthService.js', () => ({
  customerAuthService: {
    register: vi.fn().mockResolvedValue({
      refreshToken: 'customer-refresh',
      session: {
        accessToken: 'customer.access.token',
        expiresIn: 900,
        user: { id: 7, name: 'Traveller', email: 'traveller@example.com' },
      },
    }),
    login: vi.fn().mockResolvedValue({
      refreshToken: 'customer-refresh',
      session: {
        accessToken: 'customer.access.token',
        expiresIn: 900,
        user: { id: 7, name: 'Traveller', email: 'traveller@example.com' },
      },
    }),
    google: vi.fn(),
    requestOtp: vi.fn().mockResolvedValue({ sent: true, expiresIn: 300 }),
    verifyOtpAndRegister: vi.fn(),
    refresh: vi.fn(),
    exchangeLegacy: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    getCustomer: vi.fn(),
  },
}));

const { createApp } = await import('../app.js');

describe('customer authentication API', () => {
  it('treats a missing refresh cookie as an anonymous session', async () => {
    const response = await request(createApp()).post('/api/v1/customer-auth/refresh');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: null });
  });

  it('sets a distinct HttpOnly customer refresh cookie', async () => {
    const response = await request(createApp()).post('/api/v1/customer-auth/login').send({
      email: 'traveller@example.com',
      password: 'correct-password',
    });
    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBe('customer.access.token');
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(response.headers['set-cookie']?.[0]).toContain('moons_customer_refresh=');
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(response.headers['set-cookie']?.[0]).toContain('Path=/api/v1/customer-auth');
  });

  it('validates customer registration independently from CRM login', async () => {
    const response = await request(createApp()).post('/api/v1/customer-auth/register').send({
      name: '',
      email: 'invalid',
      password: 'short',
    });
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('requires an email address for OTP delivery', async () => {
    const response = await request(createApp()).post('/api/v1/customer-auth/otp/request').send({
      phone: '9876543210',
    });
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('does not expose the OTP in the request response', async () => {
    const response = await request(createApp()).post('/api/v1/customer-auth/otp/request').send({
      phone: '9876543210',
      email: 'traveller@example.com',
    });
    expect(response.status).toBe(200);
    expect(response.body.data.sent).toBe(true);
    expect(response.body.data.demoOtp).toBeUndefined();
  });
});
