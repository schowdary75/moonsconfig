import { describe, expect, it } from 'vitest';
import { getRouteMapTouchAction } from './routeMapInteraction';

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
