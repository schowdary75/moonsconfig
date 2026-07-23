import type { CrmUserRole, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

const userInclude = { roles: true } satisfies Prisma.CrmUserInclude;

export const userRepository = {
  findByEmail: (email: string) =>
    prisma.crmUser.findUnique({ where: { email }, include: userInclude }),
  findById: (id: number) => prisma.crmUser.findUnique({ where: { id }, include: userInclude }),
  list: () => prisma.crmUser.findMany({ include: userInclude, orderBy: { createdAt: 'desc' } }),
  updatePassword: (id: number, passwordHash: string) =>
    prisma.crmUser.update({ where: { id }, data: { passwordHash } }),
  create: (data: {
    email: string;
    passwordHash: string;
    name: string;
    mobile?: string | null;
    role: CrmUserRole;
  }) =>
    prisma.crmUser.create({
      data: { ...data, roles: { create: { role: data.role } } },
      include: userInclude,
    }),
  update: (
    id: number,
    data: {
      email?: string;
      passwordHash?: string;
      name?: string;
      mobile?: string | null;
      role?: CrmUserRole;
    },
  ) =>
    prisma.$transaction(async (tx) => {
      if (data.role) {
        await tx.crmUserRoleLink.deleteMany({ where: { userId: id } });
        await tx.crmUserRoleLink.create({ data: { userId: id, role: data.role } });
      }
      return tx.crmUser.update({ where: { id }, data, include: userInclude });
    }),
  delete: (id: number) => prisma.crmUser.delete({ where: { id } }),
};
