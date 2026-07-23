declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        userId: number;
        principalType: 'crm_user' | 'customer_user';
        role: string;
        sessionId: string;
        legacy: boolean;
        platformUserId?: string;
        tenantId?: string;
        membershipId?: string;
        mfaVerifiedAt?: Date;
        authMethod?: string;
        mfaEnrolled?: boolean;
      };
      rawBody?: Buffer;
      operator?: {
        id: string;
        email: string;
        role: 'support' | 'billing' | 'security' | 'platform_admin';
        sessionId: string;
        mfaVerifiedAt: Date;
        absoluteExpiresAt: Date;
      };
    }
  }
}

export {};
