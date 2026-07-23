import { Prisma } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { prisma } from '../config/prisma.js';

export const scheduledJobRepository = {
  async start(jobName: string, scheduledAt: Date) {
    const id = uuid();
    await prisma.scheduledJobExecution.create({
      data: { id, jobName, scheduledAt, status: 'running' },
    });
    return id;
  },
  complete(id: string, details: unknown) {
    return prisma.scheduledJobExecution.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        details: details as Prisma.InputJsonValue,
      },
    });
  },
  fail(id: string, message: string) {
    return prisma.scheduledJobExecution.update({
      where: { id },
      data: { status: 'failed', completedAt: new Date(), details: { message } },
    });
  },
};
