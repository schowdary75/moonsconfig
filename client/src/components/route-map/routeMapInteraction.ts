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
