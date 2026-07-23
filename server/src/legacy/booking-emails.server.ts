// Booking lifecycle emails: received → confirmed / payment-issue.
// Templates live in the `email_templates` table (admin-editable in Settings →
// Email Templates); the built-in defaults below are seeded on first use and
// used as fallback if a template row is missing. Placeholders use {{name}}.
// @ts-nocheck -- behavior-parity email adapter.
import { prisma } from '../config/prisma.js';
import { smsService } from '../services/smsService.js';

// Concise transactional SMS sent alongside each booking email (email carries the
// full detail; the text is a short heads-up that points back to My Trips).
function bookingSmsText(kind: BookingEmailKind, v: Record<string, string>): string {
  const name = v.customer_name || 'traveller';
  const ref = v.reference || '';
  switch (kind) {
    case 'booking-received':
      return `Hi ${name}, we've received your MooN Travel booking ${ref} for ${v.item_name} (${v.amount}). We'll confirm shortly — track it on My Trips.`;
    case 'booking-confirmed':
      return `Hi ${name}, your MooN Travel booking ${ref} for ${v.item_name} is CONFIRMED (travel date ${v.travel_date}). Details on My Trips.`;
    case 'booking-payment-issue':
      return `Hi ${name}, there's a payment issue with your MooN booking ${ref}. Please check your email or My Trips to resolve it.`;
    case 'booking-invoice':
      return `Hi ${name}, tax invoice ${v.invoice_number} (${v.amount}) for booking ${ref} has been emailed to you. Thank you — MooN Travel.`;
    default:
      return `Update on your MooN Travel booking ${ref}. See your email or My Trips for details.`;
  }
}

type BookingEmailKind =
  'booking-received' | 'booking-confirmed' | 'booking-payment-issue' | 'booking-invoice';

export interface BookingEmailVars {
  customer_name: string;
  reference: string;
  item_name: string;
  amount: string; // pre-formatted, e.g. "₹90,000"
  travel_date: string;
  travelers: string;
  utr?: string;
  notes?: string;
  invoice_number?: string;
  invoice_date?: string;
  customer_email?: string;
  customer_phone?: string; // E.164 or local; when present, a heads-up SMS is also sent
  amount_raw?: number; // unformatted, used for amount-in-words on the invoice
}

const BRAND_HEADER = `
  <div style="background:#111014;padding:28px 32px;border-radius:16px 16px 0 0;">
    <span style="font-family:Georgia,serif;font-size:26px;color:#f5f0e8;letter-spacing:2px;">Moo<span style="color:#d9a53f;">N</span></span>
    <span style="display:block;margin-top:4px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8a8578;">Travel · Escrow-shielded bookings</span>
  </div>`;

const BRAND_FOOTER = `
  <div style="padding:20px 32px;border-top:1px solid #eee7d9;color:#8a8578;font-size:11px;line-height:1.7;">
    Payments are escrow-protected in milestones (50% deposit · 35% commencement · 15% completion).<br/>
    Track everything anytime on your <strong>My Trips</strong> page. Reply to this email or ping your WhatsApp Travel Buddy for help.<br/>
    © MooN Travel — Explore. Experience. Repeat.
  </div>`;

function detailsTable(vars: BookingEmailVars) {
  const rows: Array<[string, string | undefined]> = [
    ['Booking reference', vars.reference],
    ['Invoice No.', vars.invoice_number],
    ['Trip', vars.item_name],
    ['Amount', vars.amount],
    ['Travel date', vars.travel_date],
    ['Travellers', vars.travelers],
    ['UTR / payment ref', vars.utr],
  ];
  return `
  <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;">
    ${rows
      .filter(([, v]) => v)
      .map(
        ([k, v]) => `<tr>
          <td style="padding:8px 0;color:#8a8578;border-bottom:1px solid #f2ecdf;width:170px;">${k}</td>
          <td style="padding:8px 0;color:#111014;border-bottom:1px solid #f2ecdf;font-weight:600;">${v}</td>
        </tr>`,
      )
      .join('')}
  </table>`;
}

// Indian-system amount in words, e.g. 90000 → "Ninety Thousand Rupees Only"
function inrWords(amount: number): string {
  const n = Math.round(Math.abs(Number(amount) || 0));
  if (n === 0) return 'Zero Rupees Only';
  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ];
  const two = (x: number): string =>
    x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ' ' + ones[x % 10] : ''}`;
  const three = (x: number): string =>
    x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' + two(x % 100) : ''}` : two(x);
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${two(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  return `${parts.join(' ')} Rupees Only`;
}

// Full professional tax-invoice document (email-safe inline styles).
// Exported for preview tooling; also injected as {{invoice_document}}.
export function invoiceDocument(vars: BookingEmailVars) {
  const invoiceDate =
    vars.invoice_date ||
    new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const amountWords = vars.amount_raw ? inrWords(vars.amount_raw) : '';
  return `
  <div style="border:1px solid #e8e0cf;border-radius:12px;overflow:hidden;margin:6px 0 4px;">

    <!-- Invoice title bar -->
    <table style="width:100%;border-collapse:collapse;background:#faf6ec;">
      <tr>
        <td style="padding:16px 22px;">
          <span style="font-family:Georgia,serif;font-size:19px;letter-spacing:3px;color:#111014;">TAX INVOICE</span>
          <span style="display:block;margin-top:2px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;">Original for recipient</span>
        </td>
        <td style="padding:16px 22px;text-align:right;vertical-align:top;">
          <span style="display:inline-block;background:#1a7f4e;color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:2px;padding:5px 14px;border-radius:999px;">PAID</span>
        </td>
      </tr>
    </table>

    <!-- Company Details -->
    <div style="padding:16px 22px;border-bottom:1px solid #e8e0cf;background:#ffffff;">
      <strong style="color:#111014;font-size:14px;display:block;margin-bottom:4px;">MooN Travel & Expeditions Pvt. Ltd.</strong>
      <span style="color:#8a8578;font-size:12px;display:block;">123 Travel Boulevard, Wanderlust City<br/>State: WL (10203), India<br/>GSTIN: 22AAAAA0000A1Z5 | hello@moonexpeditions.com</span>
    </div>

    <!-- Meta + Billed to -->
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:16px 22px;vertical-align:top;width:50%;border-right:1px solid #f2ecdf;">
          <span style="display:block;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;margin-bottom:6px;">Billed To</span>
          <span style="display:block;font-size:14px;font-weight:bold;color:#111014;">${vars.customer_name}</span>
          ${vars.customer_email ? `<span style="display:block;font-size:12px;color:#8a8578;margin-top:2px;">${vars.customer_email}</span>` : ''}
        </td>
        <td style="padding:16px 22px;vertical-align:top;">
          <table style="border-collapse:collapse;font-size:12px;width:100%;">
            <tr><td style="padding:2px 0;color:#8a8578;">Invoice No.</td><td style="padding:2px 0;text-align:right;color:#111014;font-weight:bold;">${vars.invoice_number || ''}</td></tr>
            <tr><td style="padding:2px 0;color:#8a8578;">Invoice Date</td><td style="padding:2px 0;text-align:right;color:#111014;font-weight:bold;">${invoiceDate}</td></tr>
            <tr><td style="padding:2px 0;color:#8a8578;">Booking Ref.</td><td style="padding:2px 0;text-align:right;color:#111014;font-weight:bold;">${vars.reference}</td></tr>
            <tr><td style="padding:2px 0;color:#8a8578;">Place of Supply</td><td style="padding:2px 0;text-align:right;color:#111014;font-weight:bold;">Maharashtra (27)</td></tr>
            ${vars.utr ? `<tr><td style="padding:2px 0;color:#8a8578;">Payment Ref. (UTR)</td><td style="padding:2px 0;text-align:right;color:#111014;font-weight:bold;">${vars.utr}</td></tr>` : ''}
          </table>
        </td>
      </tr>
    </table>

    <!-- Line items -->
    <table style="width:100%;border-collapse:collapse;">
      <tr style="background:#111014;">
        <td style="padding:10px 22px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#f5f0e8;">Description</td>
        <td style="padding:10px 12px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#f5f0e8;text-align:center;">HSN/SAC</td>
        <td style="padding:10px 12px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#f5f0e8;text-align:center;">Travel Date</td>
        <td style="padding:10px 22px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#f5f0e8;text-align:right;">Amount</td>
      </tr>
      <tr>
        <td style="padding:14px 22px;font-size:13px;color:#111014;font-weight:600;border-bottom:1px solid #f2ecdf;">${vars.item_name}<span style="display:block;font-size:11px;color:#8a8578;font-weight:normal;margin-top:2px;">Curated travel package · escrow-shielded</span></td>
        <td style="padding:14px 12px;font-size:13px;color:#33302a;text-align:center;border-bottom:1px solid #f2ecdf;">9985</td>
        <td style="padding:14px 12px;font-size:13px;color:#33302a;text-align:center;border-bottom:1px solid #f2ecdf;">${vars.travel_date}</td>
        <td style="padding:14px 22px;font-size:13px;color:#111014;font-weight:bold;text-align:right;border-bottom:1px solid #f2ecdf;">${vars.amount}</td>
      </tr>
    </table>

    <!-- Totals -->
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:14px 22px;vertical-align:top;">
          ${amountWords ? `<span style="display:block;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;">Amount in words</span><span style="display:block;font-size:12px;color:#33302a;margin-top:3px;font-style:italic;">${amountWords}</span>` : ''}
          <div style="margin-top:16px;">
            <span style="display:block;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;margin-bottom:4px;">Bank Details</span>
            <span style="display:block;font-size:11px;color:#33302a;line-height:1.5;">Bank: HDFC Bank, Wanderlust Branch<br/>A/C Name: MooN Travel Escrow Account<br/>A/C No: 50200000000000<br/>IFSC: HDFC0000001</span>
          </div>
        </td>
        <td style="padding:14px 22px;width:220px;">
          <table style="border-collapse:collapse;font-size:12px;width:100%;">
            <tr><td style="padding:3px 0;color:#8a8578;">Subtotal</td><td style="padding:3px 0;text-align:right;color:#111014;">${vars.amount}</td></tr>
            <tr><td style="padding:3px 0 8px;color:#8a8578;border-bottom:1px solid #e8e0cf;">Taxes &amp; fees (GST @ 18%)</td><td style="padding:3px 0 8px;text-align:right;color:#111014;border-bottom:1px solid #e8e0cf;">Included</td></tr>
            <tr><td style="padding:9px 0 0;color:#111014;font-weight:bold;font-size:14px;">Grand Total</td><td style="padding:9px 0 0;text-align:right;color:#b8860b;font-weight:bold;font-size:16px;">${vars.amount}</td></tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Payment note -->
    <div style="background:#faf6ec;border-top:1px solid #e8e0cf;padding:12px 22px;font-size:11px;color:#8a8578;line-height:1.7;">
      Paid via UPI · Funds held in MooN's escrow shield and released to operators by milestone (50% deposit · 35% commencement · 15% completion).<br/>
      This is a computer-generated tax invoice and does not require a physical signature.
    </div>
  </div>`;
}

function wrap(bodyHtml: string) {
  return `
  <div style="background:#f7f3ea;padding:24px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#fffdf8;border-radius:16px;box-shadow:0 8px 30px rgba(17,16,20,.08);overflow:hidden;">
      ${BRAND_HEADER}
      <div style="padding:28px 32px;color:#33302a;font-size:14px;line-height:1.75;">${bodyHtml}</div>
      ${BRAND_FOOTER}
    </div>
  </div>`;
}

// Built-in defaults — also seeded into email_templates so admins can edit them.
const DEFAULTS: Record<BookingEmailKind, { subject: string; body: string }> = {
  'booking-received': {
    subject: "We've received your booking {{reference}} — payment under verification",
    body:
      `<h2 style="font-family:Georgia,serif;font-weight:400;color:#111014;margin:0 0 10px;">Thank you, {{customer_name}}!</h2>` +
      `<p>Your booking has been logged and your UPI payment is now being verified by our team — this usually takes under <strong>2 hours</strong>.</p>` +
      `{{details_table}}` +
      `<p>Once verified, you'll get a confirmation email and your WhatsApp Travel Buddy will reach out with next steps.</p>`,
  },
  'booking-confirmed': {
    subject: 'Booking confirmed — {{reference}} · {{item_name}}',
    body:
      `<h2 style="font-family:Georgia,serif;font-weight:400;color:#111014;margin:0 0 10px;">You're booked, {{customer_name}}!</h2>` +
      `<p>Your payment has been verified and your booking is <strong style="color:#1a7f4e;">confirmed</strong>. Pack light, dream big.</p>` +
      `{{details_table}}` +
      `<p>Your amount is held in MooN's escrow shield and released to operators only as your trip milestones complete. Your Travel Buddy will WhatsApp you the final documents and day-wise plan.</p>`,
  },
  'booking-invoice': {
    subject: 'Your invoice {{invoice_number}} — {{item_name}}',
    body:
      `<h2 style="font-family:Georgia,serif;font-weight:400;color:#111014;margin:0 0 6px;">Your invoice, {{customer_name}}</h2>` +
      `<p style="margin:0 0 16px;">Thank you for booking with MooN Travel. Your payment has been verified — here is your tax invoice for booking <strong>{{reference}}</strong>. Keep it safe for your records.</p>` +
      `{{invoice_document}}` +
      `<p style="margin:16px 0 0;">Questions about this invoice? Just reply to this email or message your WhatsApp Travel Buddy — Maya and the team respond within a few hours.</p>`,
  },
  'booking-payment-issue': {
    subject: 'Action needed on booking {{reference}} — payment could not be verified',
    body:
      `<h2 style="font-family:Georgia,serif;font-weight:400;color:#111014;margin:0 0 10px;">Hi {{customer_name}},</h2>` +
      `<p>We couldn't verify the payment reference you shared for this booking, so it has been put on hold.</p>` +
      `{{details_table}}` +
      `<p><strong>Reviewer note:</strong> {{notes}}</p>` +
      `<p>No money verified = nothing charged. Please re-check the UTR number from your UPI app and book again, or reply to this email and our team will sort it out with you.</p>`,
  },
};

let templatesSeeded = false;
async function ensureTemplates() {
  if (templatesSeeded) return;
  for (const [name, t] of Object.entries(DEFAULTS)) {
    try {
      const existing = await prisma.email_templates.findFirst({
        where: { name },
        select: { id: true },
      });
      if (!existing) {
        await prisma.email_templates.create({
          data: { name, subject: t.subject, body: t.body, type: 'other' },
        });
      }
    } catch (e) {
      // email_templates table missing — fall back to built-ins silently.
    }
  }
  templatesSeeded = true;
}

function substitute(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

function isRealEmail(email: string | null | undefined): email is string {
  if (!email) return false;
  const e = email.toLowerCase();
  return e.includes('@') && !e.endsWith('@moon.local') && !e.endsWith('@guest.moon.local');
}

/**
 * Sends a booking lifecycle email. Never throws — booking flows must not fail
 * because SMTP is down; failures are logged and reported via return value.
 */
export async function sendBookingEmail(
  kind: BookingEmailKind,
  to: string | null | undefined,
  vars: BookingEmailVars,
): Promise<boolean> {
  // Fire the heads-up SMS independently so it still goes out even if email is
  // skipped (no address) or the SMTP send fails.
  void sendBookingSms(kind, vars);
  if (!isRealEmail(to)) return false;
  try {
    await ensureTemplates();

    // Prefer the admin-edited template row; fall back to the built-in default.
    let subject = DEFAULTS[kind].subject;
    let body = DEFAULTS[kind].body;
    try {
      const row = await prisma.email_templates.findFirst({
        where: { name: kind },
        select: { subject: true, body: true },
      });
      if (row?.subject && row?.body) {
        subject = row.subject;
        body = row.body;
      }
    } catch {
      /* table missing — built-ins */
    }

    const flat: Record<string, string> = {
      customer_name: vars.customer_name || 'traveller',
      reference: vars.reference,
      item_name: vars.item_name,
      amount: vars.amount,
      travel_date: vars.travel_date,
      travelers: vars.travelers,
      utr: vars.utr || '',
      notes: vars.notes || 'No additional notes provided.',
      invoice_number: vars.invoice_number || '',
      invoice_date: vars.invoice_date || '',
      customer_email: vars.customer_email || '',
      invoice_block: vars.invoice_number
        ? `<div style="margin-top:18px;padding:14px 18px;background:#faf6ec;border:1px solid #e8e0cf;border-radius:10px;">
             <table style="width:100%;border-collapse:collapse;"><tr>
               <td><span style="display:block;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8578;">Tax Invoice</span>
                   <span style="display:block;font-size:14px;font-weight:bold;color:#111014;margin-top:2px;">${vars.invoice_number}</span></td>
               <td style="text-align:right;vertical-align:middle;"><span style="display:inline-block;background:#1a7f4e;color:#fff;font-size:10px;font-weight:bold;letter-spacing:2px;padding:4px 12px;border-radius:999px;">PAID</span></td>
             </tr></table>
             <p style="margin:8px 0 0;font-size:11px;color:#8a8578;">The full invoice has been emailed to you separately for your records.</p>
           </div>`
        : '',
      invoice_document: invoiceDocument(vars),
      details_table: detailsTable(vars),
    };

    const html = wrap(substitute(body, flat));
    const finalSubject = substitute(subject, flat);

    const nodemailer = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const text = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const info = await transporter.sendMail({
      from: '"MooN Travel" <' + (process.env.SMTP_FROM || 'hello@moonstravel.com') + '>',
      to,
      subject: finalSubject,
      html,
      text,
    });
    console.log(`[BookingEmail] ${kind} sent to ${to} (${info.messageId})`);
    return true;
  } catch (e: any) {
    console.warn(`[BookingEmail] ${kind} to ${to} failed (SMTP config?):`, e.message);
    return false;
  }
}

// Send the concise booking SMS if a phone number is present. Never throws.
async function sendBookingSms(kind: BookingEmailKind, vars: BookingEmailVars): Promise<void> {
  const phone = (vars.customer_phone || '').trim();
  if (!phone) return;
  const flat: Record<string, string> = {
    customer_name: vars.customer_name || 'traveller',
    reference: vars.reference || '',
    item_name: vars.item_name || 'your trip',
    amount: vars.amount || '',
    travel_date: vars.travel_date || '',
    invoice_number: vars.invoice_number || '',
  };
  try {
    await smsService.sendSMS(smsPhone(phone), bookingSmsText(kind, flat));
  } catch (e: any) {
    console.warn(`[BookingSms] ${kind} to ${phone} failed:`, e?.message);
  }
}

// Match customerAuthService.phoneForSms: stored numbers have +91 stripped.
function smsPhone(stored: string): string {
  const digits = String(stored).replace(/\D/g, '');
  if (String(stored).startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export function formatInr(amount: number) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN');
}
