import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { AppError } from '../errors/AppError.js';
import { verifyPassword } from '../utils/password.js';
import { defineOperation } from './defineOperation.js';

export const protectedScreenAccessRequestSchema = z.object({
  auth: z.object({
    email: z.string().email(),
    sessionToken: z.string().min(32),
  }),
  screenKey: z.literal('trending-2'),
  accessCode: z.string().regex(/^\d{6}$/, 'Enter the 6-digit access code'),
});

export const verifyProtectedScreenAccess = defineOperation({ method: 'POST' })
  .validator(protectedScreenAccessRequestSchema)
  .handler(async ({ data }) => {
    const tokenHash = createHash('sha256').update(data.auth.sessionToken).digest('hex');
    const staff = await prisma.crmUser.findFirst({
      where: {
        email: data.auth.email.toLowerCase(),
        sessions: { some: { tokenHash, expiresAt: { gt: new Date() } } },
      },
      select: { id: true },
    });
    if (!staff) throw new AppError(401, 'Your session is no longer valid', 'UNAUTHORIZED');

    const setting = await prisma.protected_screen_access.findUnique({
      where: { screen_key: data.screenKey },
      select: { access_code_hash: true },
    });
    const granted = setting
      ? (await verifyPassword(setting.access_code_hash, data.accessCode)).valid
      : false;

    return { granted };
  });
