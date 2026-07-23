import { Prisma } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { prisma } from '../config/prisma.js';
import type { NotificationJob } from '../jobs/types.js';

export const notificationRepository = {
  create(input: NotificationJob) {
    return prisma.enterpriseNotification.create({
      data: {
        id: uuid(),
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        payload: input.payload as Prisma.InputJsonValue | undefined,
      },
    });
  },
  countSince(since: Date) {
    return prisma.enterpriseNotification.count({ where: { createdAt: { gte: since } } });
  },
};
