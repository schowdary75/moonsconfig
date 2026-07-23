import Joi from 'joi';

export const loginSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().max(255).required(),
    password: Joi.string().min(1).max(1024).required(),
    workspace: Joi.string().trim().lowercase().max(80),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const switchTenantSchema = Joi.object({
  body: Joi.object({ tenantId: Joi.string().guid({ version: 'uuidv4' }).required() }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const legacyExchangeSchema = Joi.object({
  body: Joi.object({ sessionToken: Joi.string().min(20).max(512).required() }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

const mfaCode = Joi.string().trim().min(6).max(32).required();

export const mfaCodeSchema = Joi.object({
  body: Joi.object({ code: mfaCode, recovery: Joi.boolean().default(false) }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const mfaChallengeSchema = Joi.object({
  body: Joi.object({
    challengeToken: Joi.string().min(40).max(512).required(),
    code: mfaCode,
    recovery: Joi.boolean().default(false),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const ssoStartSchema = Joi.object({
  body: Joi.object({
    workspace: Joi.string().trim().lowercase().min(2).max(80).required(),
    email: Joi.string().trim().lowercase().email().max(255),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const ssoCallbackSchema = Joi.object({
  body: Joi.object({
    code: Joi.string().min(8).max(4096).required(),
    state: Joi.string().min(32).max(512).required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});
