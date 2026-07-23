// @ts-nocheck
import { z } from 'zod';
import { USER_ROLES } from '../constants/auth.js';
import { identityOperationService as service } from '../services/identityOperationService.js';
import { defineOperation } from './defineOperation.js';

const role = z.enum(USER_ROLES);
const session = z.object({ sessionToken: z.string() });

export const crmLogin = defineOperation({ method: 'POST' })
  .validator(z.object({ email: z.string().email(), password: z.string().min(8) }))
  .handler(({ data }) => service.passwordLogin(data.email, data.password));

export const crmGoogleLogin = defineOperation({ method: 'POST' })
  .validator(z.object({ credential: z.string() }))
  .handler(({ data }) => service.googleLogin(data.credential));

export const crmLogout = defineOperation({ method: 'POST' })
  .validator(session)
  .handler(({ data }) => service.logout(data.sessionToken));

export const crmVerifySession = defineOperation({ method: 'POST' })
  .validator(session)
  .handler(({ data }) => service.verifySession(data.sessionToken));

export const getCrmUsers = defineOperation({ method: 'GET' })
  .validator(session)
  .handler(({ data }) => service.listUsers(data.sessionToken));

export const updateCrmUserRole = defineOperation({ method: 'POST' })
  .validator(session.extend({ userId: z.number(), role }))
  .handler(({ data }) => service.replaceRoles(data.sessionToken, data.userId, [data.role]));

export const updateCrmUserRoles = defineOperation({ method: 'POST' })
  .validator(session.extend({ userId: z.number(), roles: z.array(role).min(1) }))
  .handler(({ data }) => service.replaceRoles(data.sessionToken, data.userId, data.roles));

export const upsertCrmEmployee = defineOperation({ method: 'POST' })
  .validator(
    session.extend({
      id: z.number().optional(),
      name: z.string().min(1),
      email: z.string().email(),
      mobile: z.string().optional(),
      role,
      roles: z.array(role).optional(),
      password: z.string().min(8).optional(),
      badgeKey: z.string().optional(),
    }),
  )
  .handler(({ data }) => service.upsertEmployee(data.sessionToken, data));

export const updateCrmUserPassword = defineOperation({ method: 'POST' })
  .validator(session.extend({ userId: z.number(), password: z.string().min(8) }))
  .handler(({ data }) => service.updatePassword(data.sessionToken, data.userId, data.password));

export const updateCrmUserBadge = defineOperation({ method: 'POST' })
  .validator(session.extend({ userId: z.number(), badgeKey: z.string().min(1) }))
  .handler(({ data }) => service.updateBadge(data.sessionToken, data.userId, data.badgeKey));

export const getRolePermissions = defineOperation({ method: 'GET' })
  .validator(session)
  .handler(({ data }) => service.listPermissions(data.sessionToken));

export const updateRolePermissions = defineOperation({ method: 'POST' })
  .validator(session.extend({ role, modules: z.array(z.string()) }))
  .handler(({ data }) => service.replacePermissions(data.sessionToken, data.role, data.modules));

export const adminSetMayaAccessCode = defineOperation({ method: 'POST' })
  .validator(session.extend({ code: z.string().min(4) }))
  .handler(({ data }) => service.setMayaAccessCode(data.sessionToken, data.code));

export const getSignedUpUsers = defineOperation({ method: 'GET' })
  .validator(session)
  .handler(({ data }) => service.listCustomers(data.sessionToken));

export const updateCustomerUser = defineOperation({ method: 'POST' })
  .validator(
    session.extend({
      id: z.number(),
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
    }),
  )
  .handler(({ data }) => service.updateCustomer(data.sessionToken, data));
