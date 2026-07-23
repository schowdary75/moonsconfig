import Joi from 'joi';
import { USER_ROLES } from '../constants/auth.js';

const fields = {
  email: Joi.string().email().max(255),
  password: Joi.string().min(12).max(128),
  name: Joi.string().trim().min(1).max(255),
  mobile: Joi.string().trim().max(50).allow(''),
  role: Joi.string().valid(...USER_ROLES),
};
const params = Joi.object({ id: Joi.number().integer().positive().required() });

export const createUserSchema = Joi.object({
  body: Joi.object({
    email: fields.email.required(),
    password: fields.password.required(),
    name: fields.name.required(),
    mobile: fields.mobile,
    role: fields.role.required(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});
export const updateUserSchema = Joi.object({
  body: Joi.object(fields).min(1).required(),
  params,
  query: Joi.object(),
});
export const userIdSchema = Joi.object({ body: Joi.object(), params, query: Joi.object() });
