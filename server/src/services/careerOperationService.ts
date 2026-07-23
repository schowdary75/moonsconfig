import type { careers_applications_status } from '@prisma/client';
import { sendEmail } from '../integrations/email/emailAdapter.js';
import { careerOperationRepository as repository } from '../repositories/careerOperationRepository.js';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const careerOperationService = {
  async listApplications() {
    try {
      return await repository.listApplications();
    } catch {
      return [];
    }
  },
  async updateStatus(input: {
    id: number;
    status: careers_applications_status;
    email: string;
    name: string;
    jobTitle: string;
  }) {
    await repository.updateStatus(input.id, input.status);
    if (input.status === 'shortlisted') {
      const name = escapeHtml(input.name);
      const jobTitle = escapeHtml(input.jobTitle);
      await sendEmail({
        to: input.email,
        subject: `Interview Invitation: ${input.jobTitle} at MooN Travel`,
        text: `Congratulations ${input.name}. You have been shortlisted for the ${input.jobTitle} position. Our recruitment team will contact you with interview slots.`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px"><h2>Congratulations ${name}!</h2><p>You have been shortlisted for the <strong>${jobTitle}</strong> position.</p><p>Our recruitment team will contact you shortly with interview slots.</p><p>Best Regards,<br><strong>MooN Travel Talent Team</strong></p></div>`,
      });
    }
    return { success: true };
  },
};
