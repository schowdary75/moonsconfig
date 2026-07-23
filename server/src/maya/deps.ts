import { prisma } from '../config/prisma.js';
import { logger } from '../logger/index.js';
import { whatsappService } from './channels/whatsappService.js';
import type { MayaActivityStatus, MayaDeps } from './types.js';

/**
 * Builds the production {@link MayaDeps} wiring: the tenant-aware Prisma client,
 * the WhatsApp-with-SMS-fallback sender, and a best-effort activity logger that
 * records every autonomous action into `maya_activity_log` for the Mission
 * Control audit trail.
 */
export function createMayaDeps(): MayaDeps {
  return {
    prisma,
    sendWhatsApp: (to, message) => whatsappService.sendText(to, message),
    logActivity: async (
      area: string,
      action: string,
      refId: number | null,
      summary: string,
      status: MayaActivityStatus = 'done',
    ) => {
      try {
        await prisma.maya_activity_log.create({
          data: { area, action, ref_id: refId, summary: summary.slice(0, 590), status },
        });
      } catch (error) {
        logger.warn('[Maya] activity log write failed (non-fatal)', { area, action, error });
      }
    },
    now: () => new Date(),
  };
}
