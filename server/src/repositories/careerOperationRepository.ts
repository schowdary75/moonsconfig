import type { careers_applications_status } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export const careerOperationRepository = {
  async listApplications() {
    const [applications, jobs] = await prisma.$transaction([
      prisma.careers_applications.findMany({ orderBy: { created_at: 'desc' } }),
      prisma.careers_jobs.findMany({ select: { id: true, title: true, department: true } }),
    ]);
    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    return applications.map((application) => {
      const job = jobsById.get(application.job_id);
      return {
        ...application,
        job_title: job?.title ?? null,
        job_department: job?.department ?? null,
      };
    });
  },
  updateStatus: (id: number, status: careers_applications_status) =>
    prisma.careers_applications.update({ where: { id }, data: { status } }),
};
