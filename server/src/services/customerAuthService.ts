import type { CustomerUser } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { v4 as uuid } from 'uuid';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { sendEmail } from '../integrations/email/emailAdapter.js';
import { authRepository, type RefreshRecordInput } from '../repositories/authRepository.js';
import { customerAuthRepository } from '../repositories/customerAuthRepository.js';
import { createOpaqueToken, sha256 } from '../utils/crypto.js';
import { hashPassword, verifyCustomerPassword } from '../utils/password.js';
import { createAccessToken } from './tokenService.js';
import { smsService } from './smsService.js';
import { logger } from '../logger/index.js';

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

function presentCustomer(user: CustomerUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    points_balance: user.points_balance ?? 0,
    oauth_provider: user.oauthProvider,
    avatar_url: user.avatar_url,
    address: user.address,
    city: user.city,
    state: user.state,
    postal_code: user.postal_code,
    country: user.country,
  };
}

function refreshRecord(input: {
  token: string;
  userId: number;
  familyId: string;
  jwtId: string;
  meta: RequestMeta;
}): RefreshRecordInput {
  return {
    id: uuid(),
    principalType: 'customer_user',
    userId: input.userId,
    familyId: input.familyId,
    tokenHash: sha256(input.token),
    jwtId: input.jwtId,
    expiresAt: new Date(Date.now() + env.refreshTokenDays * 86_400_000),
    ipAddress: input.meta.ipAddress,
    userAgent: input.meta.userAgent?.slice(0, 512),
  };
}

async function issue(user: CustomerUser, meta: RequestMeta, familyId = uuid()) {
  const access = createAccessToken({
    userId: user.id,
    principalType: 'customer_user',
    role: 'customer',
    sid: uuid(),
  });
  const refreshToken = createOpaqueToken();
  await authRepository.createRefreshToken(
    refreshRecord({ token: refreshToken, userId: user.id, familyId, jwtId: access.jwtId, meta }),
  );
  return {
    refreshToken,
    session: {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      user: presentCustomer(user),
    },
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string) {
  return phone.replace(/[\s-]/g, '').replace(/^\+91/, '');
}

/** Build an E.164 recipient for the SMS gateway from a stored (country-code-stripped) number. */
function phoneForSms(storedPhone: string): string {
  const digits = storedPhone.replace(/\D/g, '');
  if (storedPhone.startsWith('+')) return `+${digits}`;
  // Stored numbers have +91 stripped; a bare 10-digit number is Indian.
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

async function googleProfile(token: string) {
  const tokenInfoResponse = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!tokenInfoResponse.ok)
    throw new AppError(401, 'Invalid Google token', 'INVALID_GOOGLE_TOKEN');
  const tokenInfo = (await tokenInfoResponse.json()) as { aud?: string };
  if (env.googleClientId && tokenInfo.aud !== env.googleClientId)
    throw new AppError(401, 'Google token audience mismatch', 'INVALID_GOOGLE_AUDIENCE');
  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!profileResponse.ok) throw new AppError(401, 'Invalid Google token', 'INVALID_GOOGLE_TOKEN');
  return (await profileResponse.json()) as {
    sub: string;
    email: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
}

export const customerAuthService = {
  async register(input: { name: string; email: string; password: string }, meta: RequestMeta) {
    const email = normalizeEmail(input.email);
    if (await customerAuthRepository.findByEmail(email))
      throw new AppError(409, 'Email is already registered', 'EMAIL_ALREADY_REGISTERED');
    const user = await customerAuthRepository.create({
      name: input.name.trim(),
      email,
      passwordHash: await hashPassword(input.password),
    });
    return issue(user, meta);
  },

  async login(emailInput: string, password: string, meta: RequestMeta) {
    const user = await customerAuthRepository.findByEmail(normalizeEmail(emailInput));
    if (!user) throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    const verification = await verifyCustomerPassword(user.passwordHash, password);
    if (!verification.valid)
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    if (verification.needsRehash)
      await customerAuthRepository.updatePassword(user.id, await hashPassword(password));
    return issue(user, meta);
  },

  async google(accessToken: string, meta: RequestMeta) {
    const profile = await googleProfile(accessToken);
    if (!profile.email || profile.email_verified === false)
      throw new AppError(401, 'Google email is not verified', 'GOOGLE_EMAIL_NOT_VERIFIED');
    const email = normalizeEmail(profile.email);
    let user = await customerAuthRepository.findByOauth('google', profile.sub);
    user ??= await customerAuthRepository.findByEmail(email);
    if (user) {
      user = await customerAuthRepository.connectOauth(user.id, {
        provider: 'google',
        oauthId: profile.sub,
        avatarUrl: profile.picture,
        name: profile.name,
      });
    } else {
      user = await customerAuthRepository.create({
        name: profile.name || email.split('@')[0] || 'Traveller',
        email,
        oauthProvider: 'google',
        oauthId: profile.sub,
        avatarUrl: profile.picture,
      });
    }
    return issue(user, meta);
  },

  async requestOtp(phoneInput: string, emailInput: string) {
    const phone = normalizePhone(phoneInput);
    const email = normalizeEmail(emailInput);
    if (await customerAuthRepository.findByPhone(phone))
      throw new AppError(409, 'Phone number is already registered', 'PHONE_ALREADY_REGISTERED');
    if (await customerAuthRepository.findByEmail(email))
      throw new AppError(409, 'Email is already registered', 'EMAIL_ALREADY_REGISTERED');
    const code = String(randomInt(100000, 1_000_000));
    await customerAuthRepository.saveOtp(phone, code, new Date(Date.now() + 5 * 60_000));

    const subject = 'Confirm your MooNs Travel account';
    const smsBody = `Your MooNs verification code is ${code}. It expires in 5 minutes.`;
    const body = [
      'Confirm your MooNs Travel account',
      '',
      `Your one-time verification code is: ${code}`,
      '',
      'This code expires in 5 minutes and can be used only once.',
      'If you did not try to create a MooNs Travel account, you can safely ignore this email.',
      '',
      'MooNs Travel',
      'travel.moon.com',
    ].join('\n');
    const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f3ef;color:#20150f;font-family:Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden">Use ${code} to confirm your MooNs Travel account. The code expires in 5 minutes.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ef;padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e2ddd7;border-radius:16px">
            <tr>
              <td style="padding:32px">
                <p style="margin:0 0 24px;font-size:20px;font-weight:700">MooNs Travel</p>
                <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3">Confirm your account</h1>
                <p style="margin:0 0 24px;color:#655c56;font-size:15px;line-height:1.6">Enter this one-time code in the sign-up window:</p>
                <div style="margin:0 0 24px;padding:18px;text-align:center;background:#f5f3ef;border-radius:10px;font-size:32px;font-weight:700;letter-spacing:8px">${code}</div>
                <p style="margin:0 0 12px;color:#655c56;font-size:14px;line-height:1.6">The code expires in 5 minutes and can be used only once.</p>
                <p style="margin:0;color:#655c56;font-size:13px;line-height:1.6">If you did not try to create a MooNs Travel account, you can safely ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    try {
      await sendEmail({ to: email, subject, text: body, html });
    } catch (error) {
      await customerAuthRepository.deleteOtp(phone);
      logger.error('OTP email delivery failed', { email, error });
      throw new AppError(
        502,
        'Could not email the verification code, please try again',
        'OTP_SEND_FAILED',
      );
    }

    // SMS remains a best-effort secondary notification when its gateway is configured.
    if (env.smsGateway.url) void smsService.sendSMS(phoneForSms(phone), smsBody);

    return {
      sent: true,
      channel: 'email',
      expiresIn: 300,
    };
  },

  async verifyOtpAndRegister(
    input: { name: string; email: string; password: string; phone: string; otpCode: string },
    meta: RequestMeta,
  ) {
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    if (!(await customerAuthRepository.consumeOtp(phone, input.otpCode)))
      throw new AppError(400, 'Invalid or expired verification code', 'INVALID_OTP');
    if (await customerAuthRepository.findByEmail(email))
      throw new AppError(409, 'Email is already registered', 'EMAIL_ALREADY_REGISTERED');
    if (await customerAuthRepository.findByPhone(phone))
      throw new AppError(409, 'Phone number is already registered', 'PHONE_ALREADY_REGISTERED');
    const user = await customerAuthRepository.create({
      name: input.name.trim(),
      email,
      phone,
      passwordHash: await hashPassword(input.password),
    });
    return issue(user, meta);
  },

  async refresh(rawToken: string, meta: RequestMeta) {
    const current = await authRepository.findRefreshToken(sha256(rawToken));
    if (!current || current.principalType !== 'customer_user')
      throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    if (current.revokedAt) {
      await authRepository.revokeFamily(current.familyId);
      throw new AppError(401, 'Refresh token reuse detected', 'TOKEN_REUSE_DETECTED');
    }
    if (current.expiresAt <= new Date())
      throw new AppError(401, 'Refresh token expired', 'REFRESH_TOKEN_EXPIRED');
    if (!current.customerUser)
      throw new AppError(401, 'Invalid refresh principal', 'INVALID_REFRESH_TOKEN');
    const access = createAccessToken({
      userId: current.customerUser.id,
      principalType: 'customer_user',
      role: 'customer',
      sid: uuid(),
    });
    const refreshToken = createOpaqueToken();
    const next = refreshRecord({
      token: refreshToken,
      userId: current.customerUser.id,
      familyId: current.familyId,
      jwtId: access.jwtId,
      meta,
    });
    try {
      await authRepository.rotateRefreshToken(current.id, next);
    } catch {
      await authRepository.revokeFamily(current.familyId);
      throw new AppError(401, 'Refresh token already used', 'TOKEN_REUSE_DETECTED');
    }
    return {
      refreshToken,
      session: {
        accessToken: access.token,
        expiresIn: access.expiresIn,
        user: presentCustomer(current.customerUser),
      },
    };
  },

  async exchangeLegacy(rawToken: string, meta: RequestMeta) {
    if (!env.legacySessionEnabled)
      throw new AppError(410, 'Legacy sessions are disabled', 'LEGACY_AUTH_DISABLED');
    const legacy = await authRepository.findLegacyCustomerSession(sha256(rawToken));
    if (!legacy) throw new AppError(401, 'Invalid legacy session', 'INVALID_LEGACY_SESSION');
    return issue(legacy.user, meta);
  },

  async logout(rawToken?: string) {
    if (rawToken) await authRepository.revokeByHash(sha256(rawToken));
  },

  async logoutAll(userId: number) {
    await authRepository.revokeUser('customer_user', userId);
  },

  async getCustomer(id: number) {
    const user = await customerAuthRepository.findById(id);
    if (!user) throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
    return presentCustomer(user);
  },
};
