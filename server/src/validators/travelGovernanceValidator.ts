import Joi from 'joi';

export const reviewMayaActionSchema = Joi.object({
  body: Joi.object({
    decision: Joi.string().valid('approve', 'reject').required(),
    reason: Joi.string().trim().min(2).max(500).required(),
  }).required(),
  params: Joi.object({
    proposalId: Joi.string()
      .guid({ version: ['uuidv4'] })
      .required(),
  }),
  query: Joi.object(),
});

export const mayaKillSwitchSchema = Joi.object({
  body: Joi.object({
    scope: Joi.string().valid('master', 'channel', 'tool').required(),
    key: Joi.when('scope', {
      is: 'master',
      then: Joi.forbidden(),
      otherwise: Joi.string()
        .trim()
        .lowercase()
        .pattern(/^[a-z][a-z0-9_]{1,79}$/)
        .required(),
    }),
    enabled: Joi.boolean().required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});
