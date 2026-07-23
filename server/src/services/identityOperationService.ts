import { randomBytes } from 'node:crypto';
import type { CrmUserRole } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { CRM_MODULES, DEFAULT_ROLE_PERMISSIONS } from '../constants/crmPermissions.js';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { identityOperationRepository as repository } from '../repositories/identityOperationRepository.js';
import { sha256 } from '../utils/crypto.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

type UserRecord = NonNullable<Awaited<ReturnType<typeof repository.findUserById>>>;

function rolesOf(user: UserRecord): CrmUserRole[] {
  const roles = user.roles.map((item) => item.role as CrmUserRole);
  return Array.from(new Set([user.role, ...roles]));
}

async function permissionsOf(roles: CrmUserRole[]) {
  const saved = await repository.permissionsForRoles(roles);
  if (saved.length) return saved.map((item) => item.module_key);
  return Array.from(new Set(roles.flatMap((role) => DEFAULT_ROLE_PERMISSIONS[role])));
}

async function present(user: UserRecord, sessionToken?: string) {
  const roles = rolesOf(user);
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    roles,
    name: user.name,
    mobile: user.mobile,
    badge_key: user.badgeKey || 'passport_elite',
    permissions: await permissionsOf(roles),
    session_token: sessionToken,
  };
}

async function issueSession(user: UserRecord) {
  const token = randomBytes(32).toString('hex');
  await repository.createSession(user.id, sha256(token), new Date(Date.now() + 14 * 86_400_000));
  return present(user, token);
}

async function requireUser(sessionToken: string) {
  const session = await repository.findSession(sha256(sessionToken));
  if (!session) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED');
  return session.user;
}

async function requireAdmin(sessionToken: string) {
  const user = await requireUser(sessionToken);
  if (!rolesOf(user).includes('admin')) throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  return user;
}

export const identityOperationService = {
  async passwordLogin(email: string, password: string) {
    const user = await repository.findUserByEmail(email.trim().toLowerCase());
    if (!user) return { success: false, error: 'Invalid credentials' };
    const verification = await verifyPassword(user.passwordHash, password);
    if (!verification.valid) return { success: false, error: 'Invalid credentials' };
    const current = verification.needsRehash
      ? await repository.updateUser(user.id, { passwordHash: await hashPassword(password) })
      : user;
    return { success: true, user: await issueSession(current) };
  },
  async googleLogin(credential: string) {
    try {
      if (!env.googleClientId) throw new Error('Google login is not configured');
      const ticket = await new OAuth2Client(env.googleClientId).verifyIdToken({
        idToken: credential,
        audience: env.googleClientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.email) throw new Error('Invalid token');
      const email = payload.email.toLowerCase();
      let user = await repository.findUserByEmail(email);
      if (!user) {
        user = await repository.createUser({
          email,
          passwordHash: 'oauth:google',
          role: 'viewer',
          name: payload.name || email.split('@')[0]!,
          badgeKey: 'passport_elite',
        });
      }
      return { success: true, user: await issueSession(user) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Google login failed',
      };
    }
  },
  async logout(sessionToken: string) {
    if (sessionToken) await repository.deleteSession(sha256(sessionToken));
    return { success: true };
  },
  async verifySession(sessionToken: string) {
    if (!sessionToken) return { user: null };
    const session = await repository.findSession(sha256(sessionToken));
    return { user: session ? await present(session.user, sessionToken) : null };
  },
  async requireRole(sessionToken: string, roles: CrmUserRole[]) {
    const user = await requireUser(sessionToken);
    if (!rolesOf(user).some((role) => roles.includes(role)))
      throw new AppError(403, 'Forbidden: Insufficient role', 'FORBIDDEN');
    return present(user, sessionToken);
  },
  async listUsers(sessionToken: string) {
    await requireAdmin(sessionToken);
    return Promise.all((await repository.listUsers()).map((user) => present(user)));
  },
  async replaceRoles(sessionToken: string, userId: number, roles: CrmUserRole[]) {
    await requireAdmin(sessionToken);
    const primaryRole = roles.includes('admin') ? 'admin' : roles[0]!;
    await repository.replaceRoles(userId, roles, primaryRole);
    return { success: true };
  },
  async upsertEmployee(
    sessionToken: string,
    input: {
      id?: number;
      name: string;
      email: string;
      mobile?: string;
      role: CrmUserRole;
      roles?: CrmUserRole[];
      password?: string;
      badgeKey?: string;
    },
  ) {
    await requireAdmin(sessionToken);
    const email = input.email.trim().toLowerCase();
    const existing = input.id
      ? await repository.findUserById(input.id)
      : await repository.findUserByEmail(email);
    if (!existing && !input.password)
      throw new AppError(
        400,
        'A password of at least 8 characters is required for new CRM users.',
        'PASSWORD_REQUIRED',
      );
    const user = existing
      ? await repository.updateUser(existing.id, {
          email,
          name: input.name,
          mobile: input.mobile || null,
          role: input.role,
          badgeKey: input.badgeKey || 'passport_elite',
          ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
        })
      : await repository.createUser({
          email,
          passwordHash: await hashPassword(input.password!),
          role: input.role,
          name: input.name,
          mobile: input.mobile || null,
          badgeKey: input.badgeKey || 'passport_elite',
        });
    await repository.replaceRoles(
      user.id,
      input.roles?.length ? input.roles : [input.role],
      input.role,
    );
    return { success: true };
  },
  async updatePassword(sessionToken: string, userId: number, password: string) {
    await requireAdmin(sessionToken);
    await repository.updateUser(userId, { passwordHash: await hashPassword(password) });
    return { success: true };
  },
  async updateBadge(sessionToken: string, userId: number, badgeKey: string) {
    await requireAdmin(sessionToken);
    await repository.updateUser(userId, { badgeKey });
    return { success: true };
  },
  async listPermissions(sessionToken: string) {
    await requireAdmin(sessionToken);
    return repository.listPermissions();
  },
  async replacePermissions(sessionToken: string, role: CrmUserRole, modules: string[]) {
    await requireAdmin(sessionToken);
    await repository.replacePermissions(role, modules, CRM_MODULES);
    return { success: true };
  },
  async setMayaAccessCode(sessionToken: string, code: string) {
    await requireAdmin(sessionToken);
    await repository.upsertMayaAccessCode(await hashPassword(code));
    return { success: true };
  },
  async verifyMayaAccessCode(code: string) {
    const setting = await repository.getMayaAccessCode();
    return setting ? (await verifyPassword(setting.access_code_hash, code)).valid : false;
  },
  async listCustomers(sessionToken: string) {
    await requireAdmin(sessionToken);
    return (await repository.listCustomers()).map(({ createdAt, oauthProvider, ...user }) => ({
      ...user,
      oauth_provider: oauthProvider,
      created_at: createdAt.toISOString(),
    }));
  },
  async updateCustomer(
    sessionToken: string,
    input: { id: number; name: string; email: string; phone?: string },
  ) {
    await requireAdmin(sessionToken);
    await repository.updateCustomer(input.id, {
      name: input.name,
      email: input.email.trim().toLowerCase(),
      phone: input.phone || null,
    });
    return { success: true };
  },
};
