import { prisma } from '../config/prisma.js';

export const customerAuthRepository = {
  findById: (id: number) => prisma.customerUser.findUnique({ where: { id } }),
  findByEmail: (email: string) => prisma.customerUser.findUnique({ where: { email } }),
  findByPhone: (phone: string) => prisma.customerUser.findUnique({ where: { phone } }),
  findByOauth: (provider: string, oauthId: string) =>
    prisma.customerUser.findFirst({ where: { oauthProvider: provider, oauthId } }),
  create: (data: {
    name: string;
    email: string;
    passwordHash?: string;
    phone?: string;
    oauthProvider?: string;
    oauthId?: string;
    avatarUrl?: string;
  }) =>
    prisma.customerUser.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash,
        phone: data.phone,
        oauthProvider: data.oauthProvider,
        oauthId: data.oauthId,
        avatar_url: data.avatarUrl,
        points_balance: 500,
      },
    }),
  updatePassword: (id: number, passwordHash: string) =>
    prisma.customerUser.update({ where: { id }, data: { passwordHash } }),
  connectOauth: (
    id: number,
    input: { provider: string; oauthId: string; avatarUrl?: string; name?: string },
  ) =>
    prisma.customerUser.update({
      where: { id },
      data: {
        oauthProvider: input.provider,
        oauthId: input.oauthId,
        avatar_url: input.avatarUrl,
        name: input.name,
      },
    }),
  saveOtp: (phone: string, code: string, expiresAt: Date) =>
    prisma.$transaction(async (tx) => {
      await tx.phone_verifications.deleteMany({ where: { phone } });
      return tx.phone_verifications.create({
        data: { phone, otp_code: code, expires_at: expiresAt },
      });
    }),
  deleteOtp: (phone: string) => prisma.phone_verifications.deleteMany({ where: { phone } }),
  consumeOtp: (phone: string, code: string) =>
    prisma.$transaction(async (tx) => {
      const otp = await tx.phone_verifications.findFirst({
        where: { phone, otp_code: code, expires_at: { gt: new Date() } },
        orderBy: { created_at: 'desc' },
      });
      if (!otp) return false;
      await tx.phone_verifications.deleteMany({ where: { phone } });
      return true;
    }),
};
