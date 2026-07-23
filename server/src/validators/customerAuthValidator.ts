import Joi from 'joi';

const empty = Joi.object();
const password = Joi.string().min(8).max(1024).required();

export const customerRegisterSchema = Joi.object({
  body: Joi.object({
    name: Joi.string().trim().min(1).max(255).required(),
    email: Joi.string().email().max(255).required(),
    password,
  }).required(),
  params: empty,
  query: empty,
});

export const customerLoginSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().max(255).required(),
    password: Joi.string().min(1).max(1024).required(),
  }).required(),
  params: empty,
  query: empty,
});

export const customerGoogleSchema = Joi.object({
  body: Joi.object({ accessToken: Joi.string().min(20).max(8192).required() }).required(),
  params: empty,
  query: empty,
});

export const customerOtpRequestSchema = Joi.object({
  body: Joi.object({
    phone: Joi.string().min(10).max(50).required(),
    email: Joi.string().email().max(255).required(),
  }).required(),
  params: empty,
  query: empty,
});

export const customerOtpVerifySchema = Joi.object({
  body: Joi.object({
    name: Joi.string().trim().min(1).max(255).required(),
    email: Joi.string().email().max(255).required(),
    password,
    phone: Joi.string().min(10).max(50).required(),
    otpCode: Joi.string()
      .pattern(/^\d{6}$/)
      .required(),
  }).required(),
  params: empty,
  query: empty,
});

export const customerLegacyExchangeSchema = Joi.object({
  body: Joi.object({ sessionToken: Joi.string().min(20).max(2048).required() }).required(),
  params: empty,
  query: empty,
});
