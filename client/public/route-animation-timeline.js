function finiteNonNegative(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function validSpeed(value) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function routePointCount(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function getRouteTimelineFrame({
  elapsedMs = 0,
  durationMs = 0,
  frameCount = 1,
  routePoints = 0,
} = {}) {
  const points = routePointCount(routePoints);
  const duration = finiteNonNegative(durationMs);
  const frames = Math.max(1, Math.floor(finiteNonNegative(frameCount)));
  const playable = points >= 2 && duration > 0;

  if (!playable) {
    return {
      completed: true,
      durationMs: duration,
      elapsedMs: 0,
      frameIndex: 0,
      playable: false,
      progress: points === 1 ? 1 : 0,
    };
  }

  const elapsed = Math.min(duration, finiteNonNegative(elapsedMs));
  const progress = elapsed / duration;
  return {
    completed: elapsed >= duration,
    durationMs: duration,
    elapsedMs: elapsed,
    frameIndex: Math.min(frames - 1, Math.round(progress * (frames - 1))),
    playable: true,
    progress,
  };
}

export function createRouteTimeline({
  durationMs = 0,
  routePoints = 0,
  reducedMotion = false,
  autoplay = true,
  speed = 1,
  nowMs = 0,
} = {}) {
  const baseDurationMs = finiteNonNegative(durationMs);
  const normalizedSpeed = validSpeed(speed);
  const points = routePointCount(routePoints);
  const playable = points >= 2 && baseDurationMs > 0;
  return {
    baseDurationMs,
    elapsedMs: 0,
    isPlaying: playable && autoplay && !reducedMotion,
    reducedMotion: Boolean(reducedMotion),
    routePoints: points,
    speed: normalizedSpeed,
    startedAtMs: finiteNonNegative(nowMs),
  };
}

function timelineDuration(state) {
  return state.baseDurationMs / validSpeed(state.speed);
}

export function getRouteTimelineStateFrame(state, nowMs, frameCount = 1) {
  const elapsed =
    state.elapsedMs +
    (state.isPlaying ? Math.max(0, finiteNonNegative(nowMs) - state.startedAtMs) : 0);
  return getRouteTimelineFrame({
    elapsedMs: elapsed,
    durationMs: timelineDuration(state),
    frameCount,
    routePoints: state.routePoints,
  });
}

export function pauseRouteTimeline(state, nowMs) {
  if (!state.isPlaying) return state;
  const frame = getRouteTimelineStateFrame(state, nowMs);
  return {
    ...state,
    elapsedMs: frame.elapsedMs,
    isPlaying: false,
    startedAtMs: finiteNonNegative(nowMs),
  };
}

export function resumeRouteTimeline(state, nowMs) {
  const frame = getRouteTimelineStateFrame(state, nowMs);
  if (!frame.playable || frame.completed) {
    return { ...state, isPlaying: false };
  }
  return {
    ...state,
    isPlaying: true,
    startedAtMs: finiteNonNegative(nowMs),
  };
}

export function setRouteTimelineSpeed(state, speed, nowMs) {
  const frame = getRouteTimelineStateFrame(state, nowMs);
  const normalizedSpeed = validSpeed(speed);
  const nextDuration = state.baseDurationMs / normalizedSpeed;
  return {
    ...state,
    elapsedMs: frame.progress * nextDuration,
    isPlaying: state.isPlaying && !frame.completed,
    speed: normalizedSpeed,
    startedAtMs: finiteNonNegative(nowMs),
  };
}
