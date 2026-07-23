import { apiClient } from '@/api/client';
import type { ApiSuccess } from '@/types/api';

export interface CommercialPlan {
  code: 'starter' | 'business' | 'enterprise';
  name: string;
  description: string;
  monthlyPricePaise: number | null;
  annualPricePaise: number | null;
  includedSeats: number;
  maxSeats: number | null;
  extraSeatPricePaise: number | null;
  storageBytes: string;
  features: string[];
  support: string;
  trialDays: number;
  gstExclusive: boolean;
}

export interface CompanyRegistration {
  ownerName: string;
  email: string;
  mobile: string;
  password: string;
  companyName: string;
  slug: string;
  country: string;
  timezone: string;
  billingAddress: string;
  gstin?: string;
  acceptedTerms: true;
  acceptedPrivacy: true;
  acceptedDpa: true;
}

export const platformService = {
  async plans() {
    const { data } = await apiClient.get<ApiSuccess<CommercialPlan[]>>('/billing/plans');
    return data.data;
  },
  async register(input: CompanyRegistration) {
    const { data } = await apiClient.post<
      ApiSuccess<{
        registrationId: string;
        provisioningJobId: string;
        slug: string;
        hostname: string;
        verificationExpiresAt: string;
        verificationToken?: string;
      }>
    >('/platform/registrations', input);
    return data.data;
  },
  async verifyEmail(token: string) {
    const { data } = await apiClient.post<
      ApiSuccess<{ provisioningJobId: string; tenantId: string }>
    >('/platform/email-verifications', { token });
    return data.data;
  },
  async activateOwner(token: string, password: string) {
    const { data } = await apiClient.post<
      ApiSuccess<{ provisioningJobId: string; tenantId: string; requiresMfaEnrollment: boolean }>
    >('/platform/owner-activations', {
      token,
      password,
      acceptedTerms: true,
      acceptedPrivacy: true,
      acceptedDpa: true,
    });
    return data.data;
  },
  async provisioning(jobId: string) {
    const { data } = await apiClient.get<
      ApiSuccess<{
        id: string;
        status: 'pending' | 'processing' | 'completed' | 'failed';
        attemptCount: number;
        error?: string;
        company: { name: string; slug: string; status: string };
        completedAt?: string;
      }>
    >(`/platform/provisioning/${jobId}`);
    return data.data;
  },
};
