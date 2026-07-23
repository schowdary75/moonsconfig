// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { RouteMapGenerator } from '@/components/route-map/RouteMapGenerator';

export const Route = createFileRoute('/_authenticated/route-map')({
  component: RouteMapGenerator,
});
