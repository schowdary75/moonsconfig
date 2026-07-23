import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';

const transporter = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
  : null;

export interface EmailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

function brandedFromAddress(from: string) {
  return from.includes('<') ? from : `"MooNs Travel" <${from}>`;
}

export async function sendEmail(message: EmailMessage) {
  if (!transporter || !env.smtp.from)
    throw new AppError(503, 'Email transport is not configured', 'EMAIL_NOT_CONFIGURED');
  const headers = [message.subject, ...(Array.isArray(message.to) ? message.to : [message.to])];
  if (headers.some((value) => /[\r\n]/.test(value))) {
    throw new AppError(400, 'Email headers contain invalid characters', 'INVALID_EMAIL_HEADER');
  }
  return transporter.sendMail({
    from: brandedFromAddress(env.smtp.from),
    replyTo: env.smtp.from,
    ...message,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
