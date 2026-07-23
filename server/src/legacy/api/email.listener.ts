// @ts-nocheck -- behavior-parity IMAP adapter.
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import {
  processVendorReply,
  resolveVendorInbound,
  logInboundVendorReply,
} from './db.functions.server.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const globalForImap = globalThis as unknown as {
  _imapClient: ImapFlow | null;
  _isListening: boolean;
};

let imapClient: ImapFlow | null = globalForImap._imapClient || null;
let isListening = globalForImap._isListening || false;

export async function startEmailListener() {
  if (isListening || !process.env.IMAP_USER || !process.env.IMAP_PASS) {
    console.log('[Email Listener] Missing IMAP credentials or already running.');
    return;
  }

  isListening = true;
  globalForImap._isListening = true;

  imapClient = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS,
    },
    logger: false as any, // Disable verbose logging
  });

  globalForImap._imapClient = imapClient;

  try {
    await imapClient.connect();
    console.log('[Email Listener] Connected to IMAP successfully. Waiting for vendor replies...');

    // Lock the inbox
    let lock = await imapClient.getMailboxLock('INBOX');
    try {
      // Listen for new messages
      imapClient.on('exists', () => {
        processUnreadMessages().catch(console.error);
      });
      // Initial process in case we missed some while offline
      await processUnreadMessages();
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error('[Email Listener] Failed to connect to IMAP:', err);
    isListening = false;
  }
}

export async function stopEmailListener() {
  if (imapClient) await imapClient.logout().catch(() => undefined);
  imapClient = null;
  isListening = false;
  globalForImap._imapClient = null;
  globalForImap._isListening = false;
}

async function processUnreadMessages() {
  if (!imapClient) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const lock = await imapClient.getMailboxLock('INBOX');
  try {
    // Fetch only recent unread emails to avoid processing years of backlog
    for await (const message of imapClient.fetch(
      { seen: false, since: yesterday },
      { source: true, uid: true },
    )) {
      try {
        if (!message.source) continue;
        const parsed: ParsedMail = await simpleParser(message.source);

        const senderEmail = parsed.from?.value[0]?.address || '';
        const subject = parsed.subject || '';

        // Process emails from known vendors — tolerant of alias/domain senders
        // and replies matched by RFQ subject, not just exact-email vendors.
        const resolved = await resolveVendorInbound(senderEmail, subject);
        if (!resolved && !subject.toLowerCase().includes('request for quotation')) {
          console.log(`[Email Listener] Ignoring email from unknown sender: ${senderEmail}`);
          // Optionally mark as seen so we don't process it again
          await imapClient.messageFlagsAdd({ uid: message.uid }, ['\\Seen']);
          continue;
        }

        console.log(`[Email Listener] Found unread vendor reply from ${senderEmail}: ${subject}`);

        const attachments = parsed.attachments;
        const savedAttachments = [];

        // Temporarily save attachments to disk for Gemini File API
        const tmpDir = path.join(process.cwd(), 'uploads', 'tmp_rfq');
        await fs.mkdir(tmpDir, { recursive: true });

        for (const att of attachments) {
          if (!att.content) continue;
          const ext = att.filename?.split('.').pop() || 'bin';
          const safeFilename = `${crypto.randomUUID()}.${ext}`;
          const absolutePath = path.join(tmpDir, safeFilename);
          await fs.writeFile(absolutePath, att.content);
          savedAttachments.push({
            filename: att.filename,
            absolutePath,
            mimeType: att.contentType,
          });
        }

        const emailText = parsed.text || parsed.html || '';

        // Process with AI
        await processVendorReply(emailText, savedAttachments, senderEmail, subject, parsed.date);

        // Mark as read
        await imapClient.messageFlagsAdd({ uid: message.uid }, ['\\Seen']);

        // Clean up tmp files
        for (const att of savedAttachments) {
          await fs.unlink(att.absolutePath).catch(() => {});
        }
      } catch (err) {
        console.error('[Email Listener] Error processing message:', err);
      }
    }
  } finally {
    lock.release();
  }
}

/**
 * Backfill the vendor inbox from recent mail — including messages already marked
 * read (which the live listener skips). Opens its own short-lived IMAP session,
 * logs each vendor reply into the conversation thread (de-duplicated), and does
 * NOT run AI extraction or change message flags. Safe to run repeatedly and
 * callable from any process (the live listener's client is process-local).
 */
export async function reprocessVendorInbox(days = 3): Promise<{ scanned: number; logged: number }> {
  if (!process.env.IMAP_USER || !process.env.IMAP_PASS) {
    return { scanned: 0, logged: 0 };
  }
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS },
    logger: false as any,
  });

  let scanned = 0;
  let logged = 0;
  await client.connect();
  try {
    const since = new Date();
    since.setDate(since.getDate() - Math.max(1, Math.min(days, 30)));
    // Also scan Spam: Gmail often misclassifies short vendor replies. Only
    // messages that resolve to a known vendor are ever logged, so genuine spam
    // is ignored. Missing folders are skipped gracefully.
    const folders = ['INBOX', '[Gmail]/Spam'];
    for (const folder of folders) {
      let lock;
      try {
        lock = await client.getMailboxLock(folder);
      } catch {
        continue; // folder not present on this account
      }
      try {
        for await (const message of client.fetch({ since }, { source: true })) {
          if (!message.source) continue;
          try {
            const parsed: ParsedMail = await simpleParser(message.source);
            const senderEmail = parsed.from?.value[0]?.address || '';
            const subject = parsed.subject || '';
            const body = parsed.text || parsed.html || '';
            scanned += 1;
            const res = await logInboundVendorReply(senderEmail, subject, body, parsed.date, {
              quietUnknown: true,
            });
            if (res.logged) logged += 1;
          } catch (err) {
            console.error('[Reprocess] Failed to backfill a message:', err);
          }
        }
      } finally {
        lock.release();
      }
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  if (logged > 0)
    console.log(`[Reprocess] Vendor inbox backfill: scanned ${scanned}, logged ${logged}.`);
  return { scanned, logged };
}
