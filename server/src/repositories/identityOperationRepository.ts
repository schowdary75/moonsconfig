import {
  type CrmUserRole,
  type crm_role_permissions_role,
  type crm_user_roles_role,
} from '@prisma/client';
import { prisma } from '../config/prisma.js';

const includeRoles = { roles: true } as const;
const asPermissionRole = (role: CrmUserRole) => role as crm_role_permissions_role;
const asLinkRole = (role: CrmUserRole) => role as crm_user_roles_role;

export const identityOperationRepository = {
  findUserByEmail: (email: string) =>
    prisma.crmUser.findUnique({ where: { email }, include: includeRoles }),
  findUserById: (id: number) => prisma.crmUser.findUnique({ where: { id }, include: includeRoles }),
  listUsers: () => prisma.crmUser.findMany({ include: includeRoles, orderBy: { id: 'desc' } }),
  createUser: (data: {
    email: string;
    passwordHash: string;
    role: CrmUserRole;
    name: string;
    mobile?: string | null;
    badgeKey?: string | null;
  }) =>
    prisma.crmUser.create({
      data: {
        ...data,
        roles: { create: { role: asLinkRole(data.role) } },
      },
      include: includeRoles,
    }),
  updateUser: (
    id: number,
    data: {
      email?: string;
      passwordHash?: string;
      role?: CrmUserRole;
      name?: string;
      mobile?: string | null;
      badgeKey?: string | null;
    },
  ) => prisma.crmUser.update({ where: { id }, data, include: includeRoles }),
  replaceRoles: (userId: number, roles: CrmUserRole[], primaryRole: CrmUserRole) =>
    prisma.$transaction(async (tx) => {
      await tx.crmUser.update({ where: { id: userId }, data: { role: primaryRole } });
      await tx.crmUserRoleLink.deleteMany({ where: { userId } });
      await tx.crmUserRoleLink.createMany({
        data: roles.map((role) => ({ userId, role: asLinkRole(role) })),
        skipDuplicates: true,
      });
    }),
  createSession: (userId: number, tokenHash: string, expiresAt: Date) =>
    prisma.crmAuthSession.create({ data: { userId, tokenHash, expiresAt } }),
  deleteSession: (tokenHash: string) => prisma.crmAuthSession.deleteMany({ where: { tokenHash } }),
  findSession: (tokenHash: string) =>
    prisma.crmAuthSession.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() } },
      include: { user: { include: includeRoles } },
    }),
  permissionsForRoles: (roles: CrmUserRole[]) =>
    prisma.crm_role_permissions.findMany({
      where: { role: { in: roles.map(asPermissionRole) }, can_access: true },
      select: { module_key: true },
      distinct: ['module_key'],
    }),
  listPermissions: () =>
    prisma.crm_role_permissions.findMany({ orderBy: [{ role: 'asc' }, { module_key: 'asc' }] }),
  replacePermissions: (
    role: CrmUserRole,
    modules: readonly string[],
    allModules: readonly string[],
  ) =>
    prisma.$transaction(
      allModules.map((moduleKey) =>
        prisma.crm_role_permissions.upsert({
          where: { role_module_key: { role: asPermissionRole(role), module_key: moduleKey } },
          create: {
            role: asPermissionRole(role),
            module_key: moduleKey,
            can_access: modules.includes(moduleKey),
          },
          update: { can_access: modules.includes(moduleKey) },
        }),
      ),
    ),
  upsertMayaAccessCode: (access_code_hash: string) =>
    prisma.maya_security_settings.upsert({
      where: { id: 1 },
      create: { id: 1, access_code_hash },
      update: { access_code_hash },
    }),
  getMayaAccessCode: () => prisma.maya_security_settings.findUnique({ where: { id: 1 } }),
  listCustomers: () =>
    prisma.customerUser.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        points_balance: true,
        oauthProvider: true,
        avatar_url: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
  updateCustomer: (id: number, data: { name: string; email: string; phone: string | null }) =>
    prisma.customerUser.update({ where: { id }, data }),
};
