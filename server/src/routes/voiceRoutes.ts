import { Router, Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import { authenticate, authorize } from '../middlewares/authenticate.js';
import {
  listRecordings,
  getRecording,
  resolveRecordingPath,
  reconcileRecordings,
} from '../voice/voiceRecordingService.js';
import { logger } from '../logger/index.js';

export const voiceRoutes = Router();

const guard = [authenticate, authorize('admin', 'editor', 'approver')] as const;

// List call recordings (most recent first).
voiceRoutes.get(
  '/recordings',
  ...guard,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Number(req.query.limit) || 100;
      const offset = Number(req.query.offset) || 0;
      const rows = await listRecordings(limit, offset);
      res.json({ recordings: rows });
    } catch (error) {
      logger.error('Failed to list call recordings', { error });
      next(error);
    }
  },
);

// Force an immediate reconcile scan (useful right after a call for the CRM UI).
voiceRoutes.post(
  '/recordings/reconcile',
  ...guard,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const ingested = await reconcileRecordings();
      res.json({ ingested });
    } catch (error) {
      next(error);
    }
  },
);

// Stream a recording's audio for in-browser playback / download.
voiceRoutes.get(
  '/recordings/:id/audio',
  ...guard,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

      const recording = await getRecording(id);
      if (!recording) return res.status(404).json({ error: 'Recording not found' });

      const filePath = resolveRecordingPath(recording.file_name);
      if (!filePath) return res.status(410).json({ error: 'Recording file no longer available' });

      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Accept-Ranges', 'bytes');
      fs.createReadStream(filePath).on('error', next).pipe(res);
    } catch (error) {
      next(error);
    }
  },
);
