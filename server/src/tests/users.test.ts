import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../middlewares/authenticate.js', () => ({
  authenticate: (request: { auth?: unknown }, _response: unknown, next: () => void) => {
    request.auth = {
      userId: 1,
      principalType: 'crm_user',
      role: 'admin',
      sessionId: 'test',
      legacy: false,
    };
    next();
  },
  authenticateOptional: (_request: unknown, _response: unknown, next: () => void) => next(),
  authorize: () => (_request: unknown, _response: unknown, next: () => void) => next(),
}));
vi.mock('../services/userService.js', () => ({
  userService: {
    list: vi
      .fn()
      .mockResolvedValue([{ id: 1, email: 'owner@example.com', role: 'admin', roles: ['admin'] }]),
    create: vi.fn().mockImplementation(async (input) => ({
      id: 2,
      ...input,
      password: undefined,
      roles: [input.role],
    })),
    update: vi.fn().mockImplementation(async (id, input) => ({ id, ...input })),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));
const { createApp } = await import('../app.js');

describe('user CRUD API', () => {
  it('lists users', async () => {
    const response = await request(createApp()).get('/api/v1/users');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });
  it('creates a user', async () => {
    const response = await request(createApp()).post('/api/v1/users').send({
      email: 'new@example.com',
      password: 'a-secure-password',
      name: 'New User',
      role: 'viewer',
    });
    expect(response.status).toBe(201);
    expect(response.body.data.email).toBe('new@example.com');
  });
  it('updates a user', async () => {
    const response = await request(createApp())
      .patch('/api/v1/users/2')
      .send({ name: 'Updated User' });
    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('Updated User');
  });
  it('deletes a user', async () => {
    const response = await request(createApp()).delete('/api/v1/users/2');
    expect(response.status).toBe(200);
  });
});
