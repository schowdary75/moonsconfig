import { describe, expect, it } from 'vitest';
import {
  clampRouteMapGeoView,
  getRouteMapKeyboardCommand,
  getRouteMapTouchAction,
  panRouteMapGeoView,
  panRouteMapViewBox,
  resetRouteMapViewBox,
  zoomRouteMapGeoView,
  zoomRouteMapViewBox,
} from './routeMapInteraction';

describe('getRouteMapTouchAction', () => {
  it('leaves vertical page scrolling and pinch zoom available while the map is idle', () => {
    expect(
      getRouteMapTouchAction({
        editPath: false,
        isPanning: false,
        draggingWaypoint: false,
      }),
    ).toBe('pan-y pinch-zoom');
  });

  it.each([
    { editPath: true, isPanning: false, draggingWaypoint: false },
    { editPath: false, isPanning: true, draggingWaypoint: false },
    { editPath: false, isPanning: false, draggingWaypoint: true },
  ])('keeps active map editing gestures inside the canvas', (state) => {
    expect(getRouteMapTouchAction(state)).toBe('none');
  });
});

describe('route-map keyboard commands', () => {
  it.each([
    ['+', { type: 'zoom-in' }],
    ['=', { type: 'zoom-in' }],
    ['-', { type: 'zoom-out' }],
    ['ArrowLeft', { type: 'pan', x: -1, y: 0 }],
    ['ArrowRight', { type: 'pan', x: 1, y: 0 }],
    ['ArrowUp', { type: 'pan', x: 0, y: -1 }],
    ['ArrowDown', { type: 'pan', x: 0, y: 1 }],
    ['Home', { type: 'reset' }],
    ['0', { type: 'reset' }],
  ])('maps %s', (key, command) => {
    expect(getRouteMapKeyboardCommand(key)).toEqual(command);
  });

  it.each(['Tab', 'Enter', ' ', 'Escape', 'PageDown', 'a'])('ignores %s', (key) => {
    expect(getRouteMapKeyboardCommand(key)).toBeNull();
  });
});

describe('route-map view-box bounds', () => {
  it('zooms around the requested point and clamps between 1x and 64x', () => {
    const zoomed = zoomRouteMapViewBox(
      { x: 0, y: 0, width: 800, height: 500 },
      800,
      500,
      2,
      0.25,
      0.75,
    );
    expect(zoomed).toEqual({ x: 100, y: 187.5, width: 400, height: 250 });

    const maximum = zoomRouteMapViewBox(zoomed, 800, 500, 1_000);
    expect(maximum.width).toBe(12.5);
    expect(maximum.height).toBeCloseTo(7.8125);

    expect(zoomRouteMapViewBox(maximum, 800, 500, 0.0001)).toEqual(resetRouteMapViewBox(800, 500));
  });

  it('clamps keyboard pan at every frame edge', () => {
    const view = { x: 100, y: 75, width: 400, height: 250 };

    expect(panRouteMapViewBox(view, 800, 500, -1_000, -1_000)).toEqual({
      ...view,
      x: 0,
      y: 0,
    });
    expect(panRouteMapViewBox(view, 800, 500, 1_000, 1_000)).toEqual({
      ...view,
      x: 400,
      y: 250,
    });
  });
});

describe('geographic route-map bounds', () => {
  const base = { scale: 100, translate: [400, 250] as [number, number] };

  it('clamps zoom and translation to the same safe frame', () => {
    const zoomed = zoomRouteMapGeoView(base, base, 800, 500, 2, 0, 0);
    expect(zoomed).toEqual({ scale: 200, translate: [800, 500] });

    expect(
      clampRouteMapGeoView({ scale: 10_000, translate: [-100_000, 100_000] }, base, 800, 500),
    ).toEqual({
      scale: 6_400,
      translate: [-25_000, 16_125],
    });
  });

  it('clamps keyboard pan, preserves safe base panning, and resets at the origin', () => {
    const zoomed = { scale: 200, translate: [400, 250] as [number, number] };

    expect(panRouteMapGeoView(zoomed, base, 800, 500, -10_000, 10_000)).toEqual({
      scale: 200,
      translate: [-200, 625],
    });
    expect(panRouteMapGeoView(base, base, 800, 500, 10_000, -10_000)).toEqual({
      scale: 100,
      translate: [600, 125],
    });
    expect(clampRouteMapGeoView(base, base, 800, 500)).toBeNull();
  });
});
