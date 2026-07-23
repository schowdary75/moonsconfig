import bcrypt from 'bcrypt';
import {
  type crm_role_permissions_role,
  type crm_user_roles_role,
  PrismaClient,
} from '@prisma/client';
import { CRM_MODULES, DEFAULT_ROLE_PERMISSIONS } from '../src/constants/crmPermissions.js';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.startsWith('replace-with')) {
    console.info('Seed skipped: configure a non-placeholder ADMIN_EMAIL and ADMIN_PASSWORD.');
    return;
  }

  const pepper = process.env.AUTH_PASSWORD_PEPPER;
  if (!pepper || pepper.length < 24) {
    throw new Error('AUTH_PASSWORD_PEPPER must be configured with at least 24 characters.');
  }
  const passwordHash = await bcrypt.hash(
    `${password}${pepper}`,
    Number(process.env.BCRYPT_ROUNDS || 12),
  );
  const admin = await prisma.crmUser.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      name: process.env.ADMIN_NAME || 'System Administrator',
      role: 'admin',
      roles: { create: { role: 'admin' } },
    },
  });
  await prisma.crmUserRoleLink.upsert({
    where: {
      userId_role: {
        userId: admin.id,
        role: 'admin' as crm_user_roles_role,
      },
    },
    update: {},
    create: { userId: admin.id, role: 'admin' as crm_user_roles_role },
  });
  for (const [role, enabledModules] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    for (const moduleKey of CRM_MODULES) {
      await prisma.crm_role_permissions.upsert({
        where: {
          role_module_key: {
            role: role as crm_role_permissions_role,
            module_key: moduleKey,
          },
        },
        update: {},
        create: {
          role: role as crm_role_permissions_role,
          module_key: moduleKey,
          can_access: enabledModules.includes(moduleKey),
        },
      });
    }
  }
}

main().finally(() => prisma.$disconnect());
