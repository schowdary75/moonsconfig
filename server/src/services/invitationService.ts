import { platformPrisma } from '../config/platformPrisma.js';
import { resolveTenantRuntime } from '../config/tenantContext.js';
import { COMMERCIAL_PLANS } from '../constants/commercialPlans.js';
import { AppError } from '../errors/AppError.js';
import { emailQueue } from '../jobs/queues.js';
import { createOpaqueToken, sha256 } from '../utils/crypto.js';
import { hashPassword } from '../utils/password.js';
import { env } from '../config/env.js';

type InviteRole =
  | 'admin'
  | 'manager'
  | 'editor'
  | 'approver'
  | 'sales'
  | 'support'
  | 'finance'
  | 'marketing'
  | 'operations'
  | 'viewer';

export const invitationService = {
  async invite(tenantId: string, invitedById: string, input: { email: string; role: InviteRole }) {
    const email = input.email.trim().toLowerCase();
    const runtime = await resolveTenantRuntime(tenantId);
    const existingUser = await platformPrisma.platformUser.findUnique({
      where: { email },
      include: { memberships: { where: { tenantId } } },
    });
    if (existingUser?.memberships.length)
      throw new AppError(409, 'This person already belongs to the company', 'MEMBERSHIP_EXISTS');
    const rawToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + 7 * 86_400_000);
    let result: { invitation: { id: string }; tenantName: string } | undefined;
    for (let attempt = 0; attempt < 4 && !result; attempt += 1) {
      const tenant = await platformPrisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
          trial: true,
          memberships: { where: { status: { in: ['active', 'invited'] } } },
          invitations: { where: { status: 'invited', expiresAt: { gt: new Date() } } },
          subscriptions: { where: { status: 'active' }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
      if (!tenant) throw new AppError(404, 'Company not found', 'TENANT_NOT_FOUND');
      const seatLimit =
        tenant.trial && !tenant.trial.endedAt && tenant.trial.endsAt > new Date()
          ? 10
          : (tenant.subscriptions[0]?.seats ?? COMMERCIAL_PLANS[runtime.planCode].includedSeats);
      const pendingEmails = new Set(tenant.invitations.map((item) => item.email));
      if (pendingEmails.has(email))
        throw new AppError(409, 'An active invitation already exists', 'INVITATION_EXISTS');
      const occupied = tenant.memberships.length + pendingEmails.size;
      if (occupied >= seatLimit) {
        throw new AppError(
          409,
          `All ${seatLimit} purchased staff seats are in use`,
          'STAFF_SEAT_QUOTA_EXCEEDED',
        );
      }
      result = await platformPrisma.$transaction(async (tx) => {
        const claimed = await tx.tenant.updateMany({
          where: { id: tenantId, quotaVersion: tenant.quotaVersion },
          data: { quotaVersion: { increment: 1 } },
        });
        if (!claimed.count) return undefined;
        const invitation = await tx.invitation.create({
          data: {
            tenantId,
            email,
            role: input.role,
            invitedById,
            tokenHash: sha256(rawToken),
            expiresAt,
          },
        });
        await tx.platformAuditEvent.create({
          data: {
            tenantId,
            actorId: invitedById,
            action: 'membership.invitation.created',
            target: invitation.id,
            metadata: { email, role: input.role },
          },
        });
        return { invitation, tenantName: tenant.name };
      });
    }
    if (!result)
      throw new AppError(
        409,
        'Staff capacity changed; retry the invitation',
        'SEAT_QUOTA_CONFLICT',
      );
    const { invitation, tenantName } = result;
    await emailQueue.add(
      'company-invitation',
      {
        to: email,
        subject: `You are invited to ${tenantName} on MooNsConfig`,
        text: `Accept your invitation within 7 days: ${env.appPublicUrl}/accept-invitation?token=${encodeURIComponent(rawToken)}`,
        idempotencyKey: `invitation:${invitation.id}`,
        tenantId,
      },
      { jobId: `invitation-${invitation.id}` },
    );
    return {
      id: invitation.id,
      email,
      role: input.role,
      expiresAt,
      ...(env.nodeEnv === 'production' ? {} : { token: rawToken }),
    };
  },

  async accept(rawToken: string, input: { name: string; mobile?: string; password: string }) {
    const invitation = await platformPrisma.invitation.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { tenant: true },
    });
    if (
      !invitation ||
      invitation.status !== 'invited' ||
      invitation.acceptedAt ||
      invitation.expiresAt <= new Date()
    ) {
      throw new AppError(400, 'Invitation is invalid or expired', 'INVALID_INVITATION');
    }
    const existing = await platformPrisma.platformUser.findUnique({
      where: { email: invitation.email },
    });
    const passwordHash = existing?.passwordHash ?? (await hashPassword(input.password));
    const runtime = await resolveTenantRuntime(invitation.tenantId);
    const localRole = invitation.role === 'owner' ? 'admin' : invitation.role;
    const localUser = await runtime.db.crmUser.upsert({
      where: { email: invitation.email },
      update: { name: input.name, mobile: input.mobile || null, role: localRole },
      create: {
        email: invitation.email,
        name: input.name,
        mobile: input.mobile || null,
        passwordHash,
        role: localRole,
      },
    });
    await runtime.db.crmUserRoleLink.upsert({
      where: { userId_role: { userId: localUser.id, role: localRole } },
      update: {},
      create: { userId: localUser.id, role: localRole },
    });
    const result = await platformPrisma.$transaction(async (tx) => {
      const user =
        existing ??
        (await tx.platformUser.create({
          data: {
            email: invitation.email,
            name: input.name,
            mobile: input.mobile || null,
            passwordHash,
            status: 'active',
            emailVerifiedAt: new Date(),
          },
        }));
      const membership = await tx.membership.upsert({
        where: { tenantId_userId: { tenantId: invitation.tenantId, userId: user.id } },
        update: { role: invitation.role, status: 'active', tenantUserId: localUser.id },
        create: {
          tenantId: invitation.tenantId,
          userId: user.id,
          role: invitation.role,
          status: 'active',
          tenantUserId: localUser.id,
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'active', acceptedAt: new Date() },
      });
      await tx.platformAuditEvent.create({
        data: {
          tenantId: invitation.tenantId,
          actorId: user.id,
          action: 'membership.invitation.accepted',
          target: membership.id,
        },
      });
      return membership;
    });
    return {
      tenant: { name: invitation.tenant.name, slug: invitation.tenant.slug },
      membershipId: result.id,
    };
  },
};
