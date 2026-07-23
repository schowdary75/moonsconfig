import { describe, expect, it } from 'vitest';

import {
  createRouteTimeline,
  getRouteTimelineFrame,
  getRouteTimelineStateFrame,
  pauseRouteTimeline,
  resumeRouteTimeline,
  setRouteTimelineSpeed,
} from '../../public/route-animation-timeline.js';

describe('getRouteTimelineFrame', () => {
  it.each([
    [0, 0, 0, false],
    [500, 0.5, 5, false],
    [1_000, 1, 10, true],
    [5_000, 1, 10, true],
  ])('returns a stable frame at %d ms', (elapsedMs, progress, frameIndex, completed) => {
    expect(
      getRouteTimelineFrame({
        elapsedMs,
        durationMs: 1_000,
        frameCount: 11,
        routePoints: 3,
      }),
    ).toMatchObject({ completed, frameIndex, progress });
  });

  it('renders empty and single-stop routes as completed static states', () => {
    expect(getRouteTimelineFrame({ elapsedMs: 500, durationMs: 0, routePoints: 0 })).toMatchObject({
      completed: true,
      frameIndex: 0,
      playable: false,
      progress: 0,
    });
    expect(
      getRouteTimelineFrame({ elapsedMs: 500, durationMs: 1_000, routePoints: 1 }),
    ).toMatchObject({
      completed: true,
      frameIndex: 0,
      playable: false,
      progress: 1,
    });
  });
});

describe('route timeline playback state', () => {
  it('freezes on pause and continues from the same progress on resume', () => {
    const started = createRouteTimeline({
      durationMs: 1_000,
      routePoints: 3,
      nowMs: 100,
    });
    const paused = pauseRouteTimeline(started, 500);

    expect(getRouteTimelineStateFrame(paused, 900).progress).toBeCloseTo(0.4);

    const resumed = resumeRouteTimeline(paused, 900);
    expect(getRouteTimelineStateFrame(resumed, 1_100).progress).toBeCloseTo(0.6);
  });

  it('preserves progress when the playback speed changes', () => {
    const started = createRouteTimeline({
      durationMs: 1_000,
      routePoints: 2,
      nowMs: 0,
    });
    const faster = setRouteTimelineSpeed(started, 2, 250);

    expect(getRouteTimelineStateFrame(faster, 250).progress).toBeCloseTo(0.25);
    expect(getRouteTimelineStateFrame(faster, 350).progress).toBeCloseTo(0.45);
  });

  it('never autoplays when reduced motion is preferred', () => {
    const timeline = createRouteTimeline({
      durationMs: 1_000,
      routePoints: 2,
      reducedMotion: true,
      autoplay: true,
    });

    expect(timeline.isPlaying).toBe(false);
    expect(getRouteTimelineStateFrame(timeline, 500).progress).toBe(0);
  });
});
