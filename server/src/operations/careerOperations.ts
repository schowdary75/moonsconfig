// @ts-nocheck
import { z } from 'zod';
import { careerOperationService as service } from '../services/careerOperationService.js';
import { defineOperation } from './defineOperation.js';

export const getAdminApplications = defineOperation({ method: 'GET' }).handler(() =>
  service.listApplications(),
);

export const updateApplicationStatus = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      id: z.number(),
      status: z.enum(['pending', 'shortlisted', 'scheduled', 'rejected']),
      email: z.string().email(),
      name: z.string(),
      jobTitle: z.string(),
    }),
  )
  .handler(({ data }) => service.updateStatus(data));
