import { v4 as uuid } from 'uuid';
import { env } from '../config/env.js';
import { platformPrisma } from '../config/platformPrisma.js';
import { provisioningQueue } from '../jobs/queues.js';
import { AppError } from '../errors/AppError.js';
import { createOpaqueToken, sha256 } from '../utils/crypto.js';
import { hashPassword } from '../utils/password.js';
import { encryptTenantCredential } from '../utils/tenantCredentials.js';
import { normalizeTenantSlug, tenantDatabaseIdentifiers } from '../utils/tenantNaming.js';
import { emailQueue } from '../jobs/queues.js';
import { logger } from '../logger/index.js';

export interface CompanyRegistrationInput {
  ownerName: string;
  email: string;
  mobile: string;
  password: string;
  companyName: string;
  slug: string;
  country: string;
  timezone: string;
  billingAddress: string;
  gstin?: string | null;
  acceptedTerms: true;
  acceptedPrivacy: true;
  acceptedDpa: true;
}

async function enqueue(jobId: string, tenantId: string) {
  await provisioningQueue.add(
    'provision-tenant',
    { jobId, tenantId },
    { jobId: `tenant-${tenantId}`, attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
  );
}

export const platformRegistrationService = {
  async register(
    input: CompanyRegistrationInput,
    ipAddress?: string,
    userAgent?: string,
    options: { adminCreated?: boolean; operatorId?: string } = {},
  ) {
    const email = input.email.trim().toLowerCase();
    const slug = normalizeTenantSlug(input.slug);
    const duplicate = await platformPrisma.platformUser.findUnique({ where: { email } });
    if (duplicate)
      throw new AppError(409, 'This email has already registered a company', 'TRIAL_ALREADY_USED');
    if (await platformPrisma.tenant.findUnique({ where: { slug } })) {
      throw new AppError(409, 'This company URL is already in use', 'SLUG_ALREADY_USED');
    }

    const tenantId = uuid();
    const userId = uuid();
    const membershipId = uuid();
    const jobId = uuid();
    const verificationToken = createOpaqueToken();
    const { databaseName, databaseUsername } = tenantDatabaseIdentifiers(
      input.companyName,
      tenantId,
    );
    const databasePassword = createOpaqueToken().slice(0, 48);
    const passwordHash = await hashPassword(input.password);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
    const hostname = `${slug}.${env.appBaseDomain}`.toLowerCase();
    const emailDomain = email.split('@')[1] || '';
    const publicEmailDomains = new Set([
      'gmail.com',
      'outlook.com',
      'hotmail.com',
      'yahoo.com',
      'icloud.com',
      'proton.me',
      'protonmail.com',
    ]);
    const companyFingerprint = input.companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const trialClaims = [
      { identifierType: 'owner_email', identifierHash: sha256(`email:${email}`) },
      { identifierType: 'company_name', identifierHash: sha256(`company:${companyFingerprint}`) },
      ...(!publicEmailDomains.has(emailDomain)
        ? [{ identifierType: 'email_domain', identifierHash: sha256(`domain:${emailDomain}`) }]
        : []),
    ];

    try {
      await platformPrisma.$transaction(async (tx) => {
        await tx.platformUser.create({
          data: {
            id: userId,
            email,
            name: input.ownerName.trim(),
            mobile: input.mobile.trim(),
            passwordHash,
            status: 'pending_verification',
          },
        });
        await tx.tenant.create({
          data: {
            id: tenantId,
            name: input.companyName.trim(),
            slug,
            databaseName,
            databaseUsername,
            encryptedDatabasePassword: encryptTenantCredential(databasePassword),
            status: options.adminCreated ? 'pending_activation' : 'pending',
            country: input.country,
            timezone: input.timezone,
            currency: 'INR',
            billingAddress: input.billingAddress,
            gstin: input.gstin || null,
          },
        });
        await tx.membership.create({
          data: { id: membershipId, tenantId, userId, role: 'owner', status: 'active' },
        });
        await tx.domain.create({
          data: {
            tenantId,
            hostname,
            kind: 'platform_subdomain',
            status: 'active',
            verifiedAt: new Date(),
          },
        });
        await tx.emailVerification.create({
          data: { userId, tokenHash: sha256(verificationToken), expiresAt },
        });
        await tx.provisioningJob.create({ data: { id: jobId, tenantId, status: 'pending' } });
        await tx.trialClaim.createMany({
          data: trialClaims.map((claim) => ({ ...claim, tenantId })),
        });
        if (!options.adminCreated) {
          await tx.consentRecord.createMany({
            data: [
              ['terms', input.acceptedTerms],
              ['privacy', input.acceptedPrivacy],
              ['dpa', input.acceptedDpa],
            ].map(([documentType]) => ({
              tenantId,
              userId,
              documentType: String(documentType),
              documentVersion: '2026-07-19-launch-draft',
              documentHash: sha256(`${documentType}:2026-07-19-launch-draft`),
              purpose: 'company_registration',
              ipAddress,
              userAgent: userAgent?.slice(0, 512),
            })),
          });
        }
        await tx.platformAuditEvent.create({
          data: {
            tenantId,
            actorId: userId,
            action: options.adminCreated
              ? 'ops.workspace.activation_created'
              : 'company.registration.created',
            target: tenantId,
            ipAddress,
            metadata: {
              ...(options.adminCreated
                ? { consentPendingOwnerActivation: true }
                : {
                    acceptedTerms: input.acceptedTerms,
                    acceptedPrivacy: input.acceptedPrivacy,
                    acceptedDpa: input.acceptedDpa,
                  }),
              ...(options.operatorId ? { operatorId: options.operatorId } : {}),
            },
          },
        });
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        throw new AppError(
          409,
          'This owner or company has already used a trial',
          'TRIAL_ALREADY_USED',
        );
      }
      throw error;
    }

    await emailQueue
      .add(
        'company-email-verification',
        {
          to: email,
          subject: 'Verify your MooNsConfig company account',
          text: options.adminCreated
            ? `Activate your MooNsConfig owner account within 24 hours: ${env.appPublicUrl}/activate-owner?token=${encodeURIComponent(verificationToken)}`
            : `Verify your email within 24 hours: ${env.appPublicUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`,
          idempotencyKey: `company-verification:${userId}`,
        },
        { jobId: `company-verification-${userId}` },
      )
      .catch((error) =>
        logger.error('Company verification email enqueue failed', { tenantId, error }),
      );

    return {
      registrationId: tenantId,
      provisioningJobId: jobId,
      slug,
      hostname,
      verificationExpiresAt: expiresAt,
      ...(env.nodeEnv === 'production' ? {} : { verificationToken }),
    };
  },

  async activateOwner(
    rawToken: string,
    password: string,
    consent: {
      acceptedTerms: true;
      acceptedPrivacy: true;
      acceptedDpa: true;
      ipAddress?: string;
      userAgent?: string;
    },
  ) {
    const verification = await platformPrisma.emailVerification.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: { include: { memberships: { take: 1, include: { tenant: true } } } } },
    });
    const membership = verification?.user.memberships[0];
    if (
      !verification ||
      !membership ||
      membership.role !== 'owner' ||
      membership.tenant.status !== 'pending_activation' ||
      verification.usedAt ||
      verification.expiresAt <= new Date()
    ) {
      throw new AppError(400, 'Activation link is invalid or expired', 'INVALID_OWNER_ACTIVATION');
    }
    const passwordHash = await hashPassword(password);
    const job = await platformPrisma.$transaction(async (tx) => {
      const consumed = await tx.emailVerification.updateMany({
        where: { id: verification.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new AppError(409, 'Activation link has already been used', 'OWNER_ACTIVATION_USED');
      }
      await tx.platformUser.update({
        where: { id: verification.userId },
        data: { passwordHash, status: 'active', emailVerifiedAt: new Date() },
      });
      await tx.tenant.update({
        where: { id: membership.tenantId },
        data: { status: 'pending' },
      });
      await tx.consentRecord.createMany({
        data: ['terms', 'privacy', 'dpa'].map((documentType) => ({
          tenantId: membership.tenantId,
          userId: verification.userId,
          documentType,
          documentVersion: '2026-07-19-launch-draft',
          documentHash: sha256(`${documentType}:2026-07-19-launch-draft`),
          purpose: 'owner_activation',
          ipAddress: consent.ipAddress,
          userAgent: consent.userAgent?.slice(0, 512),
        })),
      });
      await tx.platformAuditEvent.create({
        data: {
          tenantId: membership.tenantId,
          actorId: verification.userId,
          action: 'ops.workspace.owner_activated',
          target: membership.id,
        },
      });
      return tx.provisioningJob.findFirstOrThrow({
        where: { tenantId: membership.tenantId },
        orderBy: { createdAt: 'desc' },
      });
    });
    await enqueue(job.id, membership.tenantId);
    return {
      provisioningJobId: job.id,
      tenantId: membership.tenantId,
      requiresMfaEnrollment: true,
    };
  },

  async verifyEmail(rawToken: string) {
    const verification = await platformPrisma.emailVerification.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: { include: { memberships: { take: 1 } } } },
    });
    if (!verification || verification.expiresAt <= new Date()) {
      throw new AppError(400, 'Verification link is invalid or expired', 'INVALID_VERIFICATION');
    }
    const membership = verification.user.memberships[0];
    if (!membership)
      throw new AppError(409, 'Registration is incomplete', 'INCOMPLETE_REGISTRATION');
    if (verification.usedAt && verification.user.emailVerifiedAt) {
      const existingJob = await platformPrisma.provisioningJob.findFirstOrThrow({
        where: { tenantId: membership.tenantId },
        orderBy: { createdAt: 'desc' },
      });
      await enqueue(existingJob.id, membership.tenantId);
      return { provisioningJobId: existingJob.id, tenantId: membership.tenantId };
    }
    const job = await platformPrisma.$transaction(async (tx) => {
      await tx.emailVerification.update({
        where: { id: verification.id },
        data: { usedAt: new Date() },
      });
      await tx.platformUser.update({
        where: { id: verification.userId },
        data: { status: 'active', emailVerifiedAt: new Date() },
      });
      return tx.provisioningJob.findFirstOrThrow({
        where: { tenantId: membership.tenantId },
        orderBy: { createdAt: 'desc' },
      });
    });
    await enqueue(job.id, membership.tenantId);
    return { provisioningJobId: job.id, tenantId: membership.tenantId };
  },

  async status(jobId: string) {
    const job = await platformPrisma.provisioningJob.findUnique({
      where: { id: jobId },
      include: { tenant: { select: { name: true, slug: true, status: true } } },
    });
    if (!job) throw new AppError(404, 'Provisioning job not found', 'PROVISIONING_NOT_FOUND');
    return {
      id: job.id,
      status: job.status,
      attemptCount: job.attemptCount,
      error: job.status === 'failed' ? job.lastError : undefined,
      company: job.tenant,
      completedAt: job.completedAt,
    };
  },
};

export async function recoverPendingProvisioningJobs() {
  const jobs = await platformPrisma.provisioningJob.findMany({
    where: {
      status: 'pending',
      tenant: { memberships: { some: { user: { emailVerifiedAt: { not: null } } } } },
    },
    select: { id: true, tenantId: true },
    take: 100,
  });
  await Promise.all(jobs.map((job) => enqueue(job.id, job.tenantId)));
  return jobs.length;
}
