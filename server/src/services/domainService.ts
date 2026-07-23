import { resolveTxt } from 'node:dns/promises';
import {
  CloudFrontClient,
  CreateDistributionTenantCommand,
  DeleteDistributionTenantCommand,
  GetDistributionTenantCommand,
  UpdateDistributionTenantCommand,
} from '@aws-sdk/client-cloudfront';
import { env } from '../config/env.js';
import { platformPrisma } from '../config/platformPrisma.js';
import { AppError } from '../errors/AppError.js';
import { createOpaqueToken, sha256 } from '../utils/crypto.js';

const cloudFront = new CloudFrontClient({ region: 'us-east-1' });

function normalizeHostname(value: string) {
  const hostname = value.trim().toLowerCase().replace(/\.$/, '');
  if (!/^(?=.{1,253}$)(?!.*\.\.)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/.test(hostname)) {
    throw new AppError(400, 'Invalid domain name', 'INVALID_DOMAIN');
  }
  if (hostname === env.appBaseDomain || hostname.endsWith(`.${env.appBaseDomain}`)) {
    throw new AppError(400, 'Platform domains cannot be claimed', 'RESERVED_DOMAIN');
  }
  return hostname;
}

function publicDomain(domain: any) {
  return {
    id: domain.id,
    hostname: domain.hostname,
    kind: domain.kind,
    status: domain.status,
    dnsRecords: [
      ...(domain.dnsRecordName
        ? [
            {
              type: 'TXT',
              name: domain.dnsRecordName,
              value: 'Use the verification value shown when the domain was created',
            },
          ]
        : []),
      ...(env.aws.cloudFrontRoutingEndpoint
        ? [{ type: 'CNAME', name: domain.hostname, value: env.aws.cloudFrontRoutingEndpoint }]
        : []),
    ],
    verifiedAt: domain.verifiedAt,
    activatedAt: domain.activatedAt,
    failureReason: domain.failureReason,
  };
}

function auditActor(actor: string | { operatorId: string }) {
  return typeof actor === 'string' ? { actorId: actor } : { operatorId: actor.operatorId };
}

export const domainService = {
  async activatePlatformDomain(domainId: string) {
    const domain = await platformPrisma.domain.findUnique({ where: { id: domainId } });
    if (!domain || domain.kind !== 'platform_subdomain')
      throw new Error('Platform domain not found');
    if (
      !env.aws.cloudFrontDistributionId ||
      !env.aws.cloudFrontConnectionGroup ||
      domain.providerTenantId
    )
      return domain;
    const created = await cloudFront.send(
      new CreateDistributionTenantCommand({
        DistributionId: env.aws.cloudFrontDistributionId,
        ConnectionGroupId: env.aws.cloudFrontConnectionGroup,
        Name: `workspace-${domain.tenantId.slice(0, 8)}`,
        Domains: [{ Domain: domain.hostname }],
        Enabled: true,
        Tags: {
          Items: [
            { Key: 'tenantId', Value: domain.tenantId },
            { Key: 'domainId', Value: domain.id },
          ],
        },
      }),
    );
    const providerTenantId = created.DistributionTenant?.Id;
    if (!providerTenantId) throw new Error('CloudFront did not return a distribution tenant ID');
    return platformPrisma.domain.update({
      where: { id: domain.id },
      data: { providerTenantId, status: 'active', activatedAt: new Date() },
    });
  },

  async list(tenantId: string) {
    const domains = await platformPrisma.domain.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
    return domains.map(publicDomain);
  },

  async request(tenantId: string, actor: string | { operatorId: string }, rawHostname: string) {
    const hostname = normalizeHostname(rawHostname);
    const token = `moons-verify-${createOpaqueToken().slice(0, 48)}`;
    const dnsRecordName = `_moonsconfig-verification.${hostname}`;
    let domain;
    try {
      domain = await platformPrisma.domain.create({
        data: {
          tenantId,
          hostname,
          kind: 'custom_public',
          status: 'dns_pending',
          verificationHash: sha256(token),
          dnsRecordName,
          dnsRecordValue: sha256(token),
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new AppError(409, 'This domain is already registered', 'DOMAIN_ALREADY_REGISTERED');
      }
      throw error;
    }
    await platformPrisma.platformAuditEvent.create({
      data: {
        tenantId,
        ...auditActor(actor),
        action: 'domain.requested',
        target: domain.id,
        metadata: { hostname },
      },
    });
    return {
      ...publicDomain(domain),
      dnsRecords: [
        { type: 'TXT', name: dnsRecordName, value: token },
        ...(env.aws.cloudFrontRoutingEndpoint
          ? [{ type: 'CNAME', name: hostname, value: env.aws.cloudFrontRoutingEndpoint }]
          : []),
      ],
    };
  },

  async verify(tenantId: string, actor: string | { operatorId: string }, domainId: string) {
    const domain = await platformPrisma.domain.findFirst({ where: { id: domainId, tenantId } });
    if (!domain || !domain.dnsRecordName || !domain.verificationHash) {
      throw new AppError(404, 'Domain verification request not found', 'DOMAIN_NOT_FOUND');
    }
    let values: string[][];
    try {
      values = await resolveTxt(domain.dnsRecordName);
    } catch {
      throw new AppError(409, 'DNS verification record is not visible yet', 'DOMAIN_DNS_PENDING');
    }
    const valid = values.flat().some((value) => sha256(value) === domain.verificationHash);
    if (!valid)
      throw new AppError(409, 'DNS verification value does not match', 'DOMAIN_DNS_MISMATCH');

    let providerTenantId: string | null = null;
    let status: 'active' | 'certificate_pending' = 'active';
    if (env.aws.cloudFrontDistributionId && env.aws.cloudFrontConnectionGroup) {
      const created = await cloudFront.send(
        new CreateDistributionTenantCommand({
          DistributionId: env.aws.cloudFrontDistributionId,
          ConnectionGroupId: env.aws.cloudFrontConnectionGroup,
          Name: `tenant-${tenantId.slice(0, 8)}-${domain.id.slice(0, 8)}`,
          Domains: [{ Domain: domain.hostname }],
          Enabled: true,
          ManagedCertificateRequest: {
            ValidationTokenHost: 'cloudfront',
            PrimaryDomainName: domain.hostname,
            CertificateTransparencyLoggingPreference: 'enabled',
          },
          Tags: {
            Items: [
              { Key: 'tenantId', Value: tenantId },
              { Key: 'domainId', Value: domain.id },
            ],
          },
        }),
      );
      providerTenantId = created.DistributionTenant?.Id ?? null;
      if (!providerTenantId) throw new Error('CloudFront did not return a distribution tenant ID');
      status = 'certificate_pending';
    }
    const updated = await platformPrisma.domain.update({
      where: { id: domain.id },
      data: {
        status,
        verifiedAt: new Date(),
        providerTenantId,
        failureReason: null,
        ...(status === 'active' ? { activatedAt: new Date() } : {}),
      },
    });
    await platformPrisma.platformAuditEvent.create({
      data: {
        tenantId,
        ...auditActor(actor),
        action: 'domain.verified',
        target: domain.id,
        metadata: { hostname: domain.hostname, status },
      },
    });
    return publicDomain(updated);
  },

  async refresh(domainId: string) {
    const domain = await platformPrisma.domain.findUnique({ where: { id: domainId } });
    if (!domain?.providerTenantId || domain.status !== 'certificate_pending') return domain;
    const result = await cloudFront.send(
      new GetDistributionTenantCommand({ Identifier: domain.providerTenantId }),
    );
    const active = result.DistributionTenant?.Domains?.some(
      (item) => item.Domain === domain.hostname && item.Status === 'active',
    );
    return platformPrisma.domain.update({
      where: { id: domain.id },
      data: active
        ? { status: 'active', activatedAt: new Date(), failureReason: null }
        : { status: 'certificate_pending' },
    });
  },

  async revoke(tenantId: string, actor: string | { operatorId: string }, domainId: string) {
    const domain = await platformPrisma.domain.findFirst({ where: { id: domainId, tenantId } });
    if (!domain || domain.kind === 'platform_subdomain') {
      throw new AppError(404, 'Custom domain not found', 'DOMAIN_NOT_FOUND');
    }
    if (domain.providerTenantId) {
      const current = await cloudFront.send(
        new GetDistributionTenantCommand({ Identifier: domain.providerTenantId }),
      );
      if (current.ETag) {
        await cloudFront.send(
          new UpdateDistributionTenantCommand({
            Id: domain.providerTenantId,
            IfMatch: current.ETag,
            Enabled: false,
          }),
        );
      }
    }
    const updated = await platformPrisma.domain.update({
      where: { id: domain.id },
      data: { status: 'revoked' },
    });
    await platformPrisma.platformAuditEvent.create({
      data: {
        tenantId,
        ...auditActor(actor),
        action: 'domain.revoked',
        target: domain.id,
        metadata: { hostname: domain.hostname },
      },
    });
    return publicDomain(updated);
  },

  async purgeProviderTenant(providerTenantId: string) {
    const current = await cloudFront.send(
      new GetDistributionTenantCommand({ Identifier: providerTenantId }),
    );
    let etag = current.ETag;
    if (current.DistributionTenant?.Enabled && etag) {
      const disabled = await cloudFront.send(
        new UpdateDistributionTenantCommand({
          Id: providerTenantId,
          IfMatch: etag,
          Enabled: false,
        }),
      );
      etag = disabled.ETag;
    }
    if (!etag) throw new Error(`CloudFront tenant ${providerTenantId} did not return an ETag`);
    await cloudFront.send(
      new DeleteDistributionTenantCommand({ Id: providerTenantId, IfMatch: etag }),
    );
  },
};
