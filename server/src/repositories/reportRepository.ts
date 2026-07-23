import { prisma } from '../config/prisma.js';

export const reportRepository = {
  countUsers: () => prisma.crmUser.count(),
};
