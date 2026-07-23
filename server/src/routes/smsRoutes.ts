import { Router, Request, Response, NextFunction } from 'express';
import { smsService } from '../services/smsService.js';
import {
  broadcastPromotion,
  handleInboundSms,
  optOut,
  optIn,
} from '../services/customerMessagingService.js';
import { authenticate, authorize } from '../middlewares/authenticate.js';
import { logger } from '../logger/index.js';

export const smsRoutes = Router();

const adminGuard = [authenticate, authorize('admin', 'editor', 'approver')] as const;

// Send a single ad-hoc SMS (admin only).
smsRoutes.post('/send', ...adminGuard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) {
      return res.status(400).json({ error: 'Missing "to" or "message" in request body' });
    }
    const success = await smsService.sendSMS(to, message);
    return success
      ? res.json({ success: true })
      : res.status(502).json({ error: 'Failed to send SMS.' });
  } catch (error) {
    logger.error('Error in SMS /send endpoint', { error });
    next(error);
  }
});

// Trigger a promotional broadcast (admin only, explicit). Suppression-aware + throttled.
// Body: { message: string, phones?: string[], throttleMs?: number }
smsRoutes.post(
  '/broadcast',
  ...adminGuard,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message, phones, throttleMs } = req.body ?? {};
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Missing "message"' });
      }
      // Run in the background — a large list can take a while at the throttled rate.
      void broadcastPromotion(message, Array.isArray(phones) ? phones : undefined, throttleMs)
        .then((result) => logger.info('Broadcast finished', { result }))
        .catch((error) => logger.error('Broadcast failed', { error }));
      return res
        .status(202)
        .json({ accepted: true, note: 'Broadcast started; check logs for progress.' });
    } catch (error) {
      next(error);
    }
  },
);

// Manual opt-out / opt-in management (admin only).
smsRoutes.post(
  '/opt-out',
  ...adminGuard,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phone } = req.body ?? {};
      if (!phone) return res.status(400).json({ error: 'Missing "phone"' });
      await optOut(phone, 'manual');
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

smsRoutes.post(
  '/opt-in',
  ...adminGuard,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phone } = req.body ?? {};
      if (!phone) return res.status(400).json({ error: 'Missing "phone"' });
      await optIn(phone);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

// Inbound SMS webhook from the Android gateway (honors STOP/START).
// Open endpoint: the gateway on the LAN posts here; it carries no privileged action
// beyond opt-out/opt-in of the sending number.
smsRoutes.post('/inbound', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // capcom6 webhook payload: { event, payload: { message, phoneNumber, ... } }
    const body = req.body ?? {};
    const from = body.phoneNumber || body.from || body.payload?.phoneNumber || body.payload?.from;
    const text = body.message || body.text || body.payload?.message || body.payload?.text || '';
    if (!from) return res.status(400).json({ error: 'Missing sender number' });
    const outcome = await handleInboundSms(String(from), String(text));
    res.json(outcome);
  } catch (error) {
    logger.error('Error handling inbound SMS', { error });
    next(error);
  }
});
