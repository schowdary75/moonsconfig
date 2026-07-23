export function getRouteMapTouchAction({
  editPath,
  isPanning,
  draggingWaypoint,
}: {
  editPath: boolean;
  isPanning: boolean;
  draggingWaypoint: boolean;
}): 'none' | 'pan-y pinch-zoom' {
  return editPath || isPanning || draggingWaypoint ? 'none' : 'pan-y pinch-zoom';
}

export interface RouteMapViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RouteMapGeoView {
  scale: number;
  translate: [number, number];
}

export type RouteMapKeyboardCommand =
  | { type: 'zoom-in' }
  | { type: 'zoom-out' }
  | { type: 'reset' }
  | { type: 'pan'; x: -1 | 0 | 1; y: -1 | 0 | 1 };

export function getRouteMapKeyboardCommand(key: string): RouteMapKeyboardCommand | null {
  switch (key) {
    case '+':
    case '=':
      return { type: 'zoom-in' };
    case '-':
      return { type: 'zoom-out' };
    case 'ArrowLeft':
      return { type: 'pan', x: -1, y: 0 };
    case 'ArrowRight':
      return { type: 'pan', x: 1, y: 0 };
    case 'ArrowUp':
      return { type: 'pan', x: 0, y: -1 };
    case 'ArrowDown':
      return { type: 'pan', x: 0, y: 1 };
    case 'Home':
    case '0':
      return { type: 'reset' };
    default:
      return null;
  }
}

export function resetRouteMapViewBox(width: number, height: number): RouteMapViewBox {
  return { x: 0, y: 0, width, height };
}

export function clampRouteMapViewBox(
  viewBox: RouteMapViewBox,
  frameWidth: number,
  frameHeight: number,
): RouteMapViewBox {
  const width = Math.min(frameWidth, Math.max(frameWidth / 64, viewBox.width));
  const height = Math.min(frameHeight, Math.max(frameHeight / 64, viewBox.height));
  return {
    x: Math.min(frameWidth - width, Math.max(0, viewBox.x)),
    y: Math.min(frameHeight - height, Math.max(0, viewBox.y)),
    width,
    height,
  };
}

export function zoomRouteMapViewBox(
  current: RouteMapViewBox,
  frameWidth: number,
  frameHeight: number,
  factor: number,
  focusX = 0.5,
  focusY = 0.5,
): RouteMapViewBox {
  const pointerX = current.x + focusX * current.width;
  const pointerY = current.y + focusY * current.height;
  const nextWidth = Math.min(frameWidth, Math.max(frameWidth / 64, current.width / factor));
  const nextHeight = Math.min(frameHeight, Math.max(frameHeight / 64, current.height / factor));
  return clampRouteMapViewBox(
    {
      x: pointerX - (pointerX - current.x) * (nextWidth / current.width),
      y: pointerY - (pointerY - current.y) * (nextHeight / current.height),
      width: nextWidth,
      height: nextHeight,
    },
    frameWidth,
    frameHeight,
  );
}

export function panRouteMapViewBox(
  current: RouteMapViewBox,
  frameWidth: number,
  frameHeight: number,
  deltaX: number,
  deltaY: number,
): RouteMapViewBox {
  return clampRouteMapViewBox(
    { ...current, x: current.x + deltaX, y: current.y + deltaY },
    frameWidth,
    frameHeight,
  );
}

export function clampRouteMapGeoView(
  current: RouteMapGeoView,
  base: RouteMapGeoView,
  frameWidth: number,
  frameHeight: number,
  maxZoom = 64,
): RouteMapGeoView | null {
  const scale = Math.min(base.scale * maxZoom, Math.max(base.scale, current.scale));
  const zoomRatio = scale / base.scale;
  // A quarter-frame allowance preserves the existing ability to drag the map
  // before zooming while ensuring it can never be moved completely off-canvas.
  const maxOffsetX = frameWidth * 0.25 + (frameWidth * (zoomRatio - 1)) / 2;
  const maxOffsetY = frameHeight * 0.25 + (frameHeight * (zoomRatio - 1)) / 2;
  const next: RouteMapGeoView = {
    scale,
    translate: [
      Math.min(
        base.translate[0] + maxOffsetX,
        Math.max(base.translate[0] - maxOffsetX, current.translate[0]),
      ),
      Math.min(
        base.translate[1] + maxOffsetY,
        Math.max(base.translate[1] - maxOffsetY, current.translate[1]),
      ),
    ],
  };
  if (
    scale <= base.scale &&
    next.translate[0] === base.translate[0] &&
    next.translate[1] === base.translate[1]
  ) {
    return null;
  }
  return next;
}

export function zoomRouteMapGeoView(
  current: RouteMapGeoView,
  base: RouteMapGeoView,
  frameWidth: number,
  frameHeight: number,
  factor: number,
  focusX = 0.5,
  focusY = 0.5,
  maxZoom = 64,
): RouteMapGeoView | null {
  const nextScale = Math.min(base.scale * maxZoom, Math.max(base.scale, current.scale * factor));
  if (nextScale <= base.scale) return null;

  const pixelX = focusX * frameWidth;
  const pixelY = focusY * frameHeight;
  const ratio = nextScale / current.scale;
  return clampRouteMapGeoView(
    {
      scale: nextScale,
      translate: [
        pixelX - (pixelX - current.translate[0]) * ratio,
        pixelY - (pixelY - current.translate[1]) * ratio,
      ],
    },
    base,
    frameWidth,
    frameHeight,
    maxZoom,
  );
}

export function panRouteMapGeoView(
  current: RouteMapGeoView,
  base: RouteMapGeoView,
  frameWidth: number,
  frameHeight: number,
  deltaX: number,
  deltaY: number,
): RouteMapGeoView | null {
  return clampRouteMapGeoView(
    {
      ...current,
      translate: [current.translate[0] + deltaX, current.translate[1] + deltaY],
    },
    base,
    frameWidth,
    frameHeight,
  );
}
