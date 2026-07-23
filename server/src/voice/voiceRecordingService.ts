import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../logger/index.js';

/**
 * Recordings are written by Asterisk MixMonitor (see server/asterisk_config/extensions.conf)
 * straight into this directory, with metadata encoded in the filename:
 *
 *   <direction>__<from>__<to>__<uniqueid>.wav
 *
 * e.g.  inbound__919876543210__maya__1721330000.42.wav
 *       outbound__webrtc__919876543210__1721330100.7.wav
 *
 * The reconciler polls the directory and inserts a row per finalized file. This keeps
 * capture independent of the Node process (audio survives even if the API is down) and
 * works for calls that never enter the ARI app (employee<->customer bridges).
 */

const recordingDir = path.resolve(process.cwd(), env.recordingDirectory);

export function ensureRecordingDir(): string {
  fs.mkdirSync(recordingDir, { recursive: true });
  return recordingDir;
}

function decodeSegment(raw: string): string | null {
  const value = decodeURIComponent(raw).trim();
  if (!value || value.toLowerCase() === 'unknown' || value.toLowerCase() === 'anonymous') {
    return null;
  }
  return value.slice(0, 64);
}

/** Parse "<direction>__<from>__<to>__<uniqueid>.wav" -> structured metadata. */
export function parseRecordingFilename(fileName: string): {
  direction: 'inbound' | 'outbound';
  fromNumber: string | null;
  toNumber: string | null;
  uniqueid: string;
} | null {
  const base = fileName.replace(/\.wav$/i, '');
  const parts = base.split('__');
  if (parts.length !== 4) return null;
  const direction = parts[0];
  const from = parts[1] ?? '';
  const to = parts[2] ?? '';
  const uniqueid = parts[3] ?? '';
  if (direction !== 'inbound' && direction !== 'outbound') return null;
  if (!uniqueid) return null;
  return {
    direction,
    fromNumber: decodeSegment(from),
    toNumber: decodeSegment(to),
    uniqueid: uniqueid.slice(0, 80),
  };
}

/** Read a PCM/16-bit WAV header to estimate duration in whole seconds. */
function wavDurationSec(filePath: string, fileSize: number): number | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const header = Buffer.alloc(44);
      const read = fs.readSync(fd, header, 0, 44, 0);
      if (read < 44 || header.toString('ascii', 0, 4) !== 'RIFF') return null;
      const byteRate = header.readUInt32LE(28);
      if (!byteRate) return null;
      const dataBytes = Math.max(0, fileSize - 44);
      return Math.round(dataBytes / byteRate);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

let reconciling = false;

/** Scan the recording directory once and ingest any finalized files not yet in the DB. */
export async function reconcileRecordings(): Promise<number> {
  if (reconciling) return 0;
  reconciling = true;
  let ingested = 0;
  try {
    ensureRecordingDir();
    const entries = fs.readdirSync(recordingDir).filter((f) => f.toLowerCase().endsWith('.wav'));
    for (const fileName of entries) {
      const meta = parseRecordingFilename(fileName);
      if (!meta) continue;

      const filePath = path.join(recordingDir, fileName);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }
      // Skip files still being written (MixMonitor keeps the handle open until hangup).
      if (Date.now() - stat.mtimeMs < env.recordingMinAgeMs) continue;
      if (stat.size === 0) continue;

      const existing = await prisma.call_recordings.findUnique({
        where: { uniqueid: meta.uniqueid },
      });
      if (existing) continue;

      try {
        await prisma.call_recordings.create({
          data: {
            uniqueid: meta.uniqueid,
            direction: meta.direction,
            from_number: meta.fromNumber,
            to_number: meta.toNumber,
            file_name: fileName,
            file_size: stat.size,
            duration_sec: wavDurationSec(filePath, stat.size),
            recorded_at: stat.mtime,
          },
        });
        ingested += 1;
      } catch (error) {
        // Unique-constraint races are expected across overlapping scans; log the rest.
        if (!(error as { code?: string }).code?.includes('P2002')) {
          logger.error('Failed to ingest call recording', { fileName, error });
        }
      }
    }
    if (ingested > 0) logger.info('Ingested call recordings', { ingested });
  } catch (error) {
    logger.error('Recording reconcile failed', { error });
  } finally {
    reconciling = false;
  }
  return ingested;
}

let timer: NodeJS.Timeout | null = null;

export function startRecordingReconciler(): void {
  if (timer) return;
  ensureRecordingDir();
  timer = setInterval(() => {
    void reconcileRecordings();
  }, env.recordingReconcileMs);
  timer.unref?.();
  logger.info('Call recording reconciler started', {
    dir: recordingDir,
    everyMs: env.recordingReconcileMs,
  });
  // Run once on boot to backfill anything recorded while the server was down.
  void reconcileRecordings();
}

export async function listRecordings(limit = 100, offset = 0) {
  return prisma.call_recordings.findMany({
    orderBy: { recorded_at: 'desc' },
    take: Math.min(Math.max(limit, 1), 500),
    skip: Math.max(offset, 0),
  });
}

export async function getRecording(id: number) {
  return prisma.call_recordings.findUnique({ where: { id } });
}

/** Resolve a recording's absolute file path, guarding against path traversal. */
export function resolveRecordingPath(fileName: string): string | null {
  const resolved = path.resolve(recordingDir, fileName);
  if (path.dirname(resolved) !== recordingDir) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}
