import { logger } from '../logger/index.js';
import { createMayaDeps } from './deps.js';
import { runDisruptionSweep } from './disruption/disruptionService.js';
import { reviewRefunds } from './refunds/refundSlaService.js';
import type { MayaDeps } from './types.js';

/**
 * One periodic Maya operations sweep: watch flights for disruptions and review
 * refunds against SLA. Wire this into the scheduler/worker (alongside the
 * existing Maya autopilot cycle) to run it on a cadence. Every step is
 * best-effort and isolated so one failure never blocks the others.
 */
export async function runMayaOpsSweep(deps: MayaDeps = createMayaDeps()): Promise<{
  disruptions: number;
  refundBreaches: number;
}> {
  let disruptions = 0;
  let refundBreaches = 0;

  try {
    const outcomes = await runDisruptionSweep(deps);
    disruptions = outcomes.filter((o) => o.action === 'opened_case').length;
  } catch (error) {
    logger.error('[Maya] disruption sweep failed', { error });
  }

  try {
    const review = await reviewRefunds(deps);
    refundBreaches = review.breached;
  } catch (error) {
    logger.error('[Maya] refund SLA review failed', { error });
  }

  if (disruptions || refundBreaches) {
    logger.info('[Maya] ops sweep complete', { disruptions, refundBreaches });
  }
  return { disruptions, refundBreaches };
}
