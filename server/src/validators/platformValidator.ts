import Joi from 'joi';
import { BILLING_INTERVALS } from '../constants/commercialPlans.js';

export const registrationSchema = Joi.object({
  body: Joi.object({
    ownerName: Joi.string().trim().min(2).max(255).required(),
    email: Joi.string().trim().lowercase().email().max(255).required(),
    mobile: Joi.string().trim().min(7).max(50).required(),
    password: Joi.string().min(12).max(1024).required(),
    companyName: Joi.string().trim().min(2).max(255).required(),
    slug: Joi.string().trim().min(2).max(80).required(),
    country: Joi.string().trim().uppercase().length(2).default('IN'),
    timezone: Joi.string().trim().max(80).default('Asia/Kolkata'),
    billingAddress: Joi.string().trim().min(5).max(2000).required(),
    gstin: Joi.string().trim().uppercase().max(32).allow('', null),
    acceptedTerms: Joi.boolean().valid(true).required(),
    acceptedPrivacy: Joi.boolean().valid(true).required(),
    acceptedDpa: Joi.boolean().valid(true).required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const verificationSchema = Joi.object({
  body: Joi.object({ token: Joi.string().min(32).max(512).required() }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const screenExportSchema = Joi.object({
  body: Joi.object({
    pathname: Joi.string()
      .trim()
      .max(500)
      .pattern(/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/)
      .custom((value, helpers) => {
        try {
          const decoded = decodeURIComponent(value);
          return decoded.split('/').includes('..') ? helpers.error('string.pattern.base') : value;
        } catch {
          return helpers.error('string.pattern.base');
        }
      })
      .required(),
    accessCode: Joi.string()
      .pattern(/^\d{6}$/)
      .required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const ownerActivationSchema = Joi.object({
  body: Joi.object({
    token: Joi.string().min(32).max(512).required(),
    password: Joi.string().min(12).max(1024).required(),
    acceptedTerms: Joi.boolean().valid(true).required(),
    acceptedPrivacy: Joi.boolean().valid(true).required(),
    acceptedDpa: Joi.boolean().valid(true).required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const provisioningStatusSchema = Joi.object({
  body: Joi.object(),
  params: Joi.object({ jobId: Joi.string().guid({ version: 'uuidv4' }).required() }),
  query: Joi.object(),
});

export const checkoutSchema = Joi.object({
  body: Joi.object({
    planCode: Joi.string().valid('starter', 'business').required(),
    interval: Joi.string()
      .valid(...BILLING_INTERVALS)
      .required(),
    seats: Joi.number().integer().min(1).max(50).required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const cancellationSchema = Joi.object({
  body: Joi.object({ atPeriodEnd: Joi.boolean().default(true) }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

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
];

export const invitationSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().trim().lowercase().email().required(),
    role: Joi.string()
      .valid(...membershipRoles)
      .required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const invitationAcceptanceSchema = Joi.object({
  body: Joi.object({
    token: Joi.string().min(32).max(512).required(),
    name: Joi.string().trim().min(2).max(255).required(),
    mobile: Joi.string().trim().max(50).allow('', null),
    password: Joi.string().min(12).max(1024).required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const ssoConfigurationSchema = Joi.object({
  body: Joi.object({
    policy: Joi.string().valid('disabled', 'optional', 'required').required(),
    connectionId: Joi.string().trim().max(160).allow('', null),
    domains: Joi.array().items(Joi.string().trim().lowercase().hostname()).max(20).default([]),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const domainRequestSchema = Joi.object({
  body: Joi.object({
    hostname: Joi.string().trim().lowercase().hostname().max(253).required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const domainIdSchema = Joi.object({
  body: Joi.object(),
  params: Joi.object({ id: Joi.string().guid({ version: 'uuidv4' }).required() }),
  query: Joi.object(),
});

export const providerCredentialSchema = Joi.object({
  body: Joi.object({
    provider: Joi.string()
      .trim()
      .lowercase()
      .valid('smtp', 'google', 'meta', 'sms', 'telephony', 'ai', 'webhook')
      .required(),
    credentials: Joi.object()
      .pattern(Joi.string().max(80), Joi.string().trim().min(1).max(8192))
      .min(1)
      .max(20)
      .required(),
    metadata: Joi.object().pattern(Joi.string().max(80), Joi.string().max(500)).max(20),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const providerIdSchema = Joi.object({
  body: Joi.object(),
  params: Joi.object({ provider: Joi.string().trim().lowercase().max(80).required() }),
  query: Joi.object(),
});

export const exportIdSchema = Joi.object({
  body: Joi.object(),
  params: Joi.object({ id: Joi.string().guid({ version: 'uuidv4' }).required() }),
  query: Joi.object(),
});

export const accountDeletionSchema = Joi.object({
  body: Joi.object({ reason: Joi.string().trim().max(500).allow('', null) }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const secureUploadSchema = Joi.object({
  body: Joi.object({
    filename: Joi.string().trim().min(1).max(255).required(),
    mimeType: Joi.string().trim().min(3).max(160).required(),
    sizeBytes: Joi.number()
      .integer()
      .min(1)
      .max(100 * 1024 * 1024)
      .required(),
    checksumSha256: Joi.string().base64({ paddingRequired: true }).max(128),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const uploadObjectIdSchema = Joi.object({
  body: Joi.object(),
  params: Joi.object({ id: Joi.string().guid({ version: 'uuidv4' }).required() }),
  query: Joi.object(),
});

export const malwareEventSchema = Joi.object({
  body: Joi.object({
    objectKey: Joi.string()
      .pattern(/^tenants\/[0-9a-f-]{36}\/quarantine\/[0-9a-f-]{36}\.[a-z0-9]+$/i)
      .max(700)
      .required(),
    result: Joi.string()
      .valid('NO_THREATS_FOUND', 'THREATS_FOUND', 'UNSUPPORTED', 'ACCESS_DENIED', 'FAILED')
      .required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const onboardingSchema = Joi.object({
  body: Joi.object({
    completedStep: Joi.string()
      .valid('company_profile', 'branding', 'communication', 'staff', 'import', 'domain')
      .required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});
