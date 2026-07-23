import Joi from 'joi';

export const operatorLoginSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().max(255).required(),
    password: Joi.string().min(12).max(1024).required(),
    code: Joi.string()
      .pattern(/^\d{6}$/)
      .required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const operatorMfaSchema = Joi.object({
  body: Joi.object({
    code: Joi.string()
      .pattern(/^\d{6}$/)
      .required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const tenantOpsIdSchema = Joi.object({
  body: Joi.object(),
  params: Joi.object({ id: Joi.string().guid({ version: 'uuidv4' }).required() }),
  query: Joi.object(),
});

export const accessRequestSchema = Joi.object({
  body: Joi.object({
    reason: Joi.string().trim().min(10).max(500).required(),
    ticket: Joi.string().trim().min(2).max(160).required(),
    minutes: Joi.number().integer().min(5).max(30).default(30),
  }).required(),
  params: Joi.object({ id: Joi.string().guid({ version: 'uuidv4' }).required() }),
  query: Joi.object(),
});

export const migrationCreateSchema = Joi.object({
  body: Joi.object({
    migrationName: Joi.string()
      .trim()
      .pattern(/^\d+_[a-z0-9_]+$/)
      .max(160)
      .required(),
    targetVersion: Joi.string().trim().max(100).required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const rolloutIdSchema = Joi.object({
  body: Joi.object(),
  params: Joi.object({ id: Joi.string().guid({ version: 'uuidv4' }).required() }),
  query: Joi.object(),
});

export const restoreDrillSchema = Joi.object({
  body: Joi.object({ artifactId: Joi.string().guid({ version: 'uuidv4' }) }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

const uuid = Joi.string().guid({ version: 'uuidv4' });
const reason = Joi.string().trim().min(10).max(500).required();
const ticket = Joi.string().trim().min(2).max(160).required();
const confirmation = Joi.string().trim().min(1).max(255).required();
const expectedUpdatedAt = Joi.date().iso().required();
const idempotencyKey = Joi.string().trim().min(16).max(160).required();
const governed = { reason, ticket, confirmation, idempotencyKey };
const membershipRoles = [
  'admin',
  'manager',
  'editor',
  'approver',
  'sales',
  'support',
  'finance',
  'marketing',
  'operations',
  'viewer',
] as const;

const pageQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(25),
  query: Joi.string().trim().allow('').max(255),
  status: Joi.string().trim().max(80),
  tenantId: uuid,
  plan: Joi.string().valid('starter', 'business', 'enterprise'),
  kind: Joi.string().valid('memberships', 'invitations', 'deletions', 'exports'),
});

export const platformListSchema = Joi.object({
  body: Joi.object(),
  params: Joi.object(),
  query: pageQuery,
});

export const platformWorkspaceSchema = Joi.object({
  body: Joi.object(),
  params: Joi.object({ tenantId: uuid.required() }),
  query: Joi.object(),
});

export const governedWorkspaceActionSchema = Joi.object({
  body: Joi.object({ ...governed, expectedUpdatedAt }).required(),
  params: Joi.object({ tenantId: uuid.required() }),
  query: Joi.object(),
});

export const governedMembershipActionSchema = Joi.object({
  body: Joi.object({
    reason,
    ticket,
    confirmation,
    expectedUpdatedAt,
    idempotencyKey,
    role: Joi.string().valid(
      'admin',
      'manager',
      'editor',
      'approver',
      'sales',
      'support',
      'finance',
      'marketing',
      'operations',
      'viewer',
    ),
    status: Joi.string().valid('active', 'suspended'),
  })
    .or('role', 'status')
    .required(),
  params: Joi.object({ tenantId: uuid.required(), membershipId: uuid.required() }),
  query: Joi.object(),
});

export const governedMemberCommandSchema = Joi.object({
  body: Joi.object(governed).required(),
  params: Joi.object({ tenantId: uuid.required(), membershipId: uuid.required() }),
  query: Joi.object(),
});

export const governedOwnershipSchema = Joi.object({
  body: Joi.object({
    reason,
    ticket,
    confirmation,
    expectedUpdatedAt,
    idempotencyKey,
    targetMembershipId: uuid.required(),
  }).required(),
  params: Joi.object({ tenantId: uuid.required() }),
  query: Joi.object(),
});

export const governedInvitationSchema = Joi.object({
  body: Joi.object(governed).required(),
  params: Joi.object({ tenantId: uuid.required(), invitationId: uuid.required() }),
  query: Joi.object(),
});

export const governedBillingSchema = Joi.object({
  body: Joi.object({
    reason,
    ticket,
    confirmation: Joi.string().valid('RECONCILE').required(),
    idempotencyKey,
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const governedInvoiceSchema = Joi.object({
  body: Joi.object(governed).required(),
  params: Joi.object({ invoiceId: uuid.required() }),
  query: Joi.object(),
});

export const invoiceDownloadSchema = Joi.object({
  body: Joi.object(),
  params: Joi.object({ invoiceId: uuid.required() }),
  query: Joi.object(),
});

export const governedAccessGrantSchema = Joi.object({
  body: Joi.object(governed).required(),
  params: Joi.object({ grantId: uuid.required() }),
  query: Joi.object(),
});

export const governedAccessRequestSchema = Joi.object({
  body: Joi.object({
    reason,
    ticket,
    confirmation,
    idempotencyKey,
    minutes: Joi.number().integer().min(5).max(30).default(30),
  }).required(),
  params: Joi.object({ tenantId: uuid.required() }),
  query: Joi.object(),
});

export const operatorActivationSchema = Joi.object({
  body: Joi.object({
    token: Joi.string().min(32).max(512).required(),
    password: Joi.string().min(16).max(1024).required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const operatorActivationVerifySchema = Joi.object({
  body: Joi.object({
    operatorId: uuid.required(),
    code: Joi.string()
      .pattern(/^\d{6}$/)
      .required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

const workspaceFields = {
  name: Joi.string().trim().min(2).max(255),
  slug: Joi.string().trim().min(2).max(80),
  country: Joi.string().trim().uppercase().length(2),
  timezone: Joi.string().trim().max(80),
  billingAddress: Joi.string().trim().min(5).max(2000),
  gstin: Joi.string().trim().uppercase().max(32).allow('', null),
  internal: Joi.boolean(),
};

export const createWorkspaceSchema = Joi.object({
  body: Joi.object({
    ...governed,
    ...workspaceFields,
    name: workspaceFields.name.required(),
    slug: workspaceFields.slug.required(),
    billingAddress: workspaceFields.billingAddress.required(),
    ownerName: Joi.string().trim().min(2).max(255).required(),
    ownerEmail: Joi.string().trim().lowercase().email().max(255).required(),
    ownerMobile: Joi.string().trim().min(7).max(50).required(),
    beta: Joi.boolean(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const updateWorkspaceSchema = Joi.object({
  body: Joi.object({ ...governed, expectedUpdatedAt, ...workspaceFields })
    .or('name', 'slug', 'country', 'timezone', 'billingAddress', 'gstin', 'internal')
    .required(),
  params: Joi.object({ tenantId: uuid.required() }),
  query: Joi.object(),
});

export const governedTenantSchema = Joi.object({
  body: Joi.object({ ...governed, expectedUpdatedAt }).required(),
  params: Joi.object({ tenantId: uuid.required() }),
  query: Joi.object(),
});

export const inviteMemberSchema = Joi.object({
  body: Joi.object({
    ...governed,
    expectedUpdatedAt,
    email: Joi.string().trim().lowercase().email().required(),
    role: Joi.string()
      .valid(...membershipRoles)
      .required(),
  }).required(),
  params: Joi.object({ tenantId: uuid.required() }),
  query: Joi.object(),
});

export const governedMembershipDeleteSchema = Joi.object({
  body: Joi.object({ ...governed, expectedUpdatedAt }).required(),
  params: Joi.object({ tenantId: uuid.required(), membershipId: uuid.required() }),
  query: Joi.object(),
});

export const trialAdminSchema = Joi.object({
  body: Joi.object({
    ...governed,
    expectedUpdatedAt,
    action: Joi.string().valid('extend', 'end').required(),
    days: Joi.when('action', {
      is: 'extend',
      then: Joi.number().integer().min(1).max(30).required(),
      otherwise: Joi.forbidden(),
    }),
  }).required(),
  params: Joi.object({ tenantId: uuid.required() }),
  query: Joi.object(),
});

export const manualSubscriptionSchema = Joi.object({
  body: Joi.object({
    ...governed,
    expectedUpdatedAt,
    tenantId: uuid.required(),
    seats: Joi.number().integer().min(1).required(),
    amountPaise: Joi.number().integer().min(0).required(),
    outstandingPaise: Joi.number().integer().min(0),
    contractReference: Joi.string().trim().min(2).max(160).required(),
    interval: Joi.string().valid('monthly', 'annual'),
    status: Joi.string().valid('active', 'past_due', 'suspended'),
    periodStart: Joi.date().iso().required(),
    periodEnd: Joi.date().iso().greater(Joi.ref('periodStart')).required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const subscriptionActionSchema = Joi.object({
  body: Joi.object({
    ...governed,
    expectedUpdatedAt,
    action: Joi.string()
      .valid('change', 'cancel', 'suspend', 'renew', 'mark_paid', 'set_dues')
      .required(),
    planCode: Joi.string().valid('starter', 'business'),
    interval: Joi.string().valid('monthly', 'annual'),
    seats: Joi.number().integer().min(1),
    amountPaise: Joi.number().integer().min(0),
    outstandingPaise: Joi.number().integer().min(0),
    contractReference: Joi.string().trim().max(160),
    periodEnd: Joi.date().iso(),
  }).required(),
  params: Joi.object({ subscriptionId: uuid.required() }),
  query: Joi.object(),
});

export const providerCheckoutSchema = Joi.object({
  body: Joi.object({
    ...governed,
    expectedUpdatedAt,
    tenantId: uuid.required(),
    planCode: Joi.string().valid('starter', 'business').required(),
    interval: Joi.string().valid('monthly', 'annual').required(),
    seats: Joi.number().integer().min(1).max(50).required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

const invoiceLine = Joi.object({
  description: Joi.string().trim().min(2).max(500).required(),
  quantity: Joi.number().integer().min(1).max(10000).required(),
  unitAmountPaise: Joi.number().integer().min(0).required(),
  taxPaise: Joi.number().integer().min(0).default(0),
  hsnSac: Joi.string().trim().max(32).allow('', null),
  providerTaxId: Joi.string().trim().max(160).allow('', null),
});

export const createInvoiceSchema = Joi.object({
  body: Joi.object({
    ...governed,
    expectedUpdatedAt,
    tenantId: uuid.required(),
    subscriptionId: uuid.allow(null),
    invoiceNumber: Joi.string().trim().min(2).max(80).required(),
    legalName: Joi.string().trim().max(255),
    gstin: Joi.string().trim().max(32).allow('', null),
    billingAddress: Joi.string().trim().max(2000),
    placeOfSupply: Joi.string().trim().max(80).allow('', null),
    dueAt: Joi.date().iso().allow(null),
    lines: Joi.array().items(invoiceLine).min(1).max(100).required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const invoiceActionSchema = Joi.object({
  body: Joi.object({
    ...governed,
    expectedUpdatedAt,
    action: Joi.string().valid('issue', 'void').required(),
  }).required(),
  params: Joi.object({ invoiceId: uuid.required() }),
  query: Joi.object(),
});

export const updateInvoiceSchema = Joi.object({
  body: Joi.object({
    ...governed,
    expectedUpdatedAt,
    legalName: Joi.string().trim().min(2).max(255).required(),
    gstin: Joi.string().trim().max(32).allow('', null),
    billingAddress: Joi.string().trim().min(5).max(2000).required(),
    placeOfSupply: Joi.string().trim().max(80).allow('', null),
    dueAt: Joi.date().iso().allow(null),
    lines: Joi.array().items(invoiceLine).min(1).max(100).required(),
  }).required(),
  params: Joi.object({ invoiceId: uuid.required() }),
  query: Joi.object(),
});

export const operatorInviteSchema = Joi.object({
  body: Joi.object({
    ...governed,
    email: Joi.string().trim().lowercase().email().required(),
    name: Joi.string().trim().min(2).max(255).required(),
    role: Joi.string().valid('support', 'billing', 'security', 'platform_admin').required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const operatorUpdateSchema = Joi.object({
  body: Joi.object({
    ...governed,
    expectedUpdatedAt,
    action: Joi.string().valid('role', 'suspend', 'reactivate', 'reset_mfa').required(),
    role: Joi.when('action', {
      is: 'role',
      then: Joi.string().valid('support', 'billing', 'security', 'platform_admin').required(),
      otherwise: Joi.forbidden(),
    }),
  }).required(),
  params: Joi.object({ operatorId: uuid.required() }),
  query: Joi.object(),
});

const planDefinition = Joi.object({
  code: Joi.string().valid('starter', 'business', 'enterprise').required(),
  name: Joi.string().trim().min(2).max(80).required(),
  description: Joi.string().trim().min(2).max(500).required(),
  includedSeats: Joi.number().integer().min(1).required(),
  maxSeats: Joi.number().integer().min(1).allow(null).required(),
  storageBytes: Joi.alternatives()
    .try(Joi.number().integer().min(1), Joi.string().pattern(/^\d+$/))
    .required(),
  monthlyPricePaise: Joi.number().integer().min(0).allow(null).required(),
  annualPricePaise: Joi.number().integer().min(0).allow(null).required(),
  extraSeatPricePaise: Joi.number().integer().min(0).allow(null).required(),
  entitlements: Joi.array()
    .items(
      Joi.object({
        featureKey: Joi.string().trim().min(2).max(100).required(),
        enabled: Joi.boolean().default(true),
        limitValue: Joi.alternatives().try(
          Joi.number().integer(),
          Joi.string().pattern(/^\d+$/),
          Joi.valid(null),
        ),
      }),
    )
    .min(1)
    .required(),
});

export const catalogCreateSchema = Joi.object({
  body: Joi.object({
    ...governed,
    version: Joi.number().integer().min(1).required(),
    notes: Joi.string().trim().max(4000).allow('', null),
    plans: Joi.array().items(planDefinition).length(3).required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const catalogPublishSchema = Joi.object({
  body: Joi.object({ ...governed, expectedUpdatedAt }).required(),
  params: Joi.object({ catalogId: uuid.required() }),
  query: Joi.object(),
});

export const governedExportSchema = Joi.object({
  body: Joi.object(governed).required(),
  params: Joi.object({ exportId: uuid.required() }),
  query: Joi.object(),
});

export const adminDomainCreateSchema = Joi.object({
  body: Joi.object({
    ...governed,
    expectedUpdatedAt,
    hostname: Joi.string().trim().lowercase().hostname().max(253).required(),
  }).required(),
  params: Joi.object({ tenantId: uuid.required() }),
  query: Joi.object(),
});

export const adminDomainActionSchema = Joi.object({
  body: Joi.object({
    ...governed,
    expectedUpdatedAt,
    action: Joi.string().valid('verify', 'revoke').required(),
  }).required(),
  params: Joi.object({ tenantId: uuid.required(), domainId: uuid.required() }),
  query: Joi.object(),
});

export const adminSsoSchema = Joi.object({
  body: Joi.object({
    ...governed,
    expectedUpdatedAt,
    policy: Joi.string().valid('disabled', 'optional', 'required').required(),
    connectionId: Joi.string().trim().max(160).allow('', null),
    domains: Joi.array().items(Joi.string().trim().lowercase().hostname()).max(20).default([]),
  }).required(),
  params: Joi.object({ tenantId: uuid.required() }),
  query: Joi.object(),
});

export const adminProviderSchema = Joi.object({
  body: Joi.object({
    ...governed,
    expectedUpdatedAt,
    provider: Joi.string()
      .valid('smtp', 'google', 'meta', 'sms', 'telephony', 'ai', 'webhook')
      .required(),
    credentials: Joi.object()
      .pattern(Joi.string().max(80), Joi.string().trim().min(1).max(8192))
      .min(1)
      .max(20)
      .required(),
    metadata: Joi.object().pattern(Joi.string().max(80), Joi.string().max(500)).max(20),
  }).required(),
  params: Joi.object({ tenantId: uuid.required() }),
  query: Joi.object(),
});

export const adminProviderDeleteSchema = Joi.object({
  body: Joi.object({ ...governed, expectedUpdatedAt }).required(),
  params: Joi.object({
    tenantId: uuid.required(),
    provider: Joi.string().trim().lowercase().max(80).required(),
  }),
  query: Joi.object(),
});

export const adminExportCreateSchema = Joi.object({
  body: Joi.object({
    ...governed,
    expectedUpdatedAt,
    legalBasis: Joi.string().trim().min(10).max(500).required(),
  }).required(),
  params: Joi.object({ tenantId: uuid.required() }),
  query: Joi.object(),
});

export const adminDeletionRetrySchema = Joi.object({
  body: Joi.object(governed).required(),
  params: Joi.object({ deletionId: uuid.required() }),
  query: Joi.object(),
});

export const adminMigrationCreateSchema = Joi.object({
  body: Joi.object({
    ...governed,
    migrationName: Joi.string()
      .trim()
      .pattern(/^\d+_[a-z0-9_]+$/)
      .max(160)
      .required(),
    targetVersion: Joi.string().trim().max(100).required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const adminMigrationActionSchema = Joi.object({
  body: Joi.object({
    ...governed,
    expectedUpdatedAt,
    action: Joi.string().valid('start', 'pause', 'advance', 'retry', 'delete_draft').required(),
  }).required(),
  params: Joi.object({ rolloutId: uuid.required() }),
  query: Joi.object(),
});

export const adminProvisioningActionSchema = Joi.object({
  body: Joi.object({
    ...governed,
    expectedUpdatedAt,
    action: Joi.string().valid('retry', 'cancel').required(),
  }).required(),
  params: Joi.object({ jobId: uuid.required() }),
  query: Joi.object(),
});
