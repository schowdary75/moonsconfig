// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import React, { useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import { useNavigate, useLocation } from '@/lib/routerCompat';
import logo from '../assets/logo.png';
import { GlobalSearchModal } from './global-search-modal';
import { ScreenExportDialog } from './screen-export-dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { prefetchRoute, prefetchHeavyRoutesWhenIdle } from '@/routes/routePrefetch';
import {
  LayoutDashboard,
  Briefcase,
  LogOut,
  Wallet,
  ChevronRight,
  Search,
  Bell,
  Orbit,
  Pin,
  PinOff,
  Plane,
  Grid3X3,
  Ship,
  CalendarCheck2,
  CarFront,
  ChartPie,
  ClipboardCheck,
  Command,
  ContactRound,
  Database,
  Gift,
  Handshake,
  Hotel,
  Image,
  Landmark,
  Mail,
  MapPinned,
  Route as RouteIcon,
  Megaphone,
  Newspaper,
  Package as PackageIcon,
  Palette,
  PhoneCall,
  ReceiptText,
  ScrollText,
  Shield,
  SlidersHorizontal,
  Store,
  Target,
  TicketPercent,
  TrendingUp,
  UserRoundCheck,
  WandSparkles,
  Workflow,
  Gauge,
  MapPin,
  ShieldAlert,
  CreditCard,
  Download,
  LifeBuoy,
} from 'lucide-react';
import { Button } from './ui/button';
import {
  adminGetLeads,
  adminUpdateLeadStatus,
  type LeadSubmissionRow,
} from '../lib/api/db.functions';
import { OperationRequestError } from '@/services/legacyOperationService';

interface NavItem {
  name: string;
  href?: string;
  icon?: React.ElementType;
  roles: string[];
  moduleKey?: string;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  {
    name: 'Operations',
    roles: ['admin', 'editor', 'manager', 'sales', 'support', 'finance', 'viewer'],
    children: [
      {
        name: 'Sales',
        href: '/crm/pipeline',
        icon: Handshake,
        roles: ['admin', 'editor', 'manager', 'sales', 'support'],
        moduleKey: 'sales_pipeline',
      },
      {
        name: 'Clients',
        href: '/crm/clients',
        icon: UserRoundCheck,
        roles: ['admin', 'editor', 'manager', 'sales', 'support'],
        moduleKey: 'clients',
      },
      {
        name: 'Leads',
        href: '/leads',
        icon: PhoneCall,
        roles: ['admin', 'editor', 'manager', 'sales', 'support'],
        moduleKey: 'leads',
      },
      {
        name: 'Follow-ups',
        href: '/leads/followups',
        icon: CalendarCheck2,
        roles: ['admin', 'editor', 'manager', 'sales', 'support'],
        moduleKey: 'followups',
      },
      {
        name: 'Proposals',
        href: '/quotes',
        icon: ScrollText,
        roles: ['admin', 'editor', 'manager', 'sales', 'viewer'],
        moduleKey: 'quotes',
      },
      {
        name: 'Bookings',
        href: '/bookings/all',
        icon: Wallet,
        roles: ['admin', 'editor', 'manager', 'support', 'viewer'],
        moduleKey: 'bookings',
      },
      {
        name: 'Escrow Ledger',
        href: '/escrow',
        icon: Landmark,
        roles: ['admin', 'manager', 'finance', 'viewer'],
        moduleKey: 'escrow',
      },
      {
        name: 'Refunds',
        href: '/refunds',
        icon: ReceiptText,
        roles: ['admin', 'manager', 'finance', 'viewer'],
        moduleKey: 'refunds',
      },
      {
        name: 'Invoices',
        href: '/invoices',
        icon: ScrollText,
        roles: ['admin', 'manager', 'finance', 'viewer'],
        moduleKey: 'invoices',
      },
      {
        name: 'Journey Manager',
        href: '/crm/journey-manager',
        icon: MapPin,
        roles: ['admin', 'editor', 'manager', 'support', 'operations'],
        moduleKey: 'journey_manager',
      },
      {
        name: 'Incident Desk',
        href: '/crm/incident-desk',
        icon: ShieldAlert,
        roles: ['admin', 'manager', 'support', 'operations'],
        moduleKey: 'incident_desk',
      },
      {
        name: 'Maya Ops Center',
        href: '/maya-ops',
        icon: LifeBuoy,
        roles: ['admin', 'manager', 'support', 'operations', 'finance'],
      },
    ],
  },
  {
    name: 'Inventory',
    roles: ['admin', 'editor', 'manager', 'operations', 'viewer'],
    children: [
      {
        name: 'Trending',
        href: '/trending',
        icon: TrendingUp,
        roles: ['admin', 'editor', 'manager', 'operations', 'viewer'],
        moduleKey: 'trending',
      },
      {
        name: 'Trending-2',
        href: '/trending-2',
        icon: ChartPie,
        roles: ['admin', 'editor', 'manager', 'operations', 'viewer'],
        moduleKey: 'trending',
      },
      {
        name: 'Packages',
        href: '/packages',
        icon: PackageIcon,
        roles: ['admin', 'editor', 'manager', 'operations', 'viewer'],
        moduleKey: 'packages',
      },
      {
        name: 'Travel Themes',
        href: '/themes',
        icon: Palette,
        roles: ['admin', 'editor', 'manager', 'operations', 'viewer'],
        moduleKey: 'themes',
      },
      {
        name: 'Master Catalog',
        href: '/catalog',
        icon: Database,
        roles: ['admin', 'editor', 'manager', 'operations', 'viewer'],
        moduleKey: 'catalog',
      },

      {
        name: 'Hotels & Stays',
        href: '/stays',
        icon: Hotel,
        roles: ['admin', 'editor', 'manager', 'operations', 'viewer'],
        moduleKey: 'stays',
      },
      {
        name: 'Cars',
        href: '/cars',
        icon: CarFront,
        roles: ['admin', 'editor', 'manager', 'operations', 'viewer'],
        moduleKey: 'cars',
      },
      {
        name: 'Flights',
        href: '/flights',
        icon: Plane,
        roles: ['admin', 'editor', 'manager', 'operations', 'viewer'],
        moduleKey: 'flights',
      },
      {
        name: 'Cruises',
        href: '/cruises',
        icon: Ship,
        roles: ['admin', 'editor', 'manager', 'operations', 'viewer'],
        moduleKey: 'cruises',
      },
      {
        name: 'Destinations',
        href: '/destinations',
        icon: MapPinned,
        roles: ['admin', 'editor', 'manager', 'operations', 'viewer'],
        moduleKey: 'destinations',
      },
      {
        name: 'Experiences',
        href: '/experiences',
        icon: WandSparkles,
        roles: ['admin', 'editor', 'manager', 'operations', 'viewer'],
        moduleKey: 'experiences',
      },
      {
        name: 'Route Map',
        href: '/route-map',
        icon: RouteIcon,
        roles: ['admin', 'editor', 'manager', 'operations', 'viewer'],
        moduleKey: 'route_map',
      },
      {
        name: 'Asset Library',
        href: '/assets',
        icon: Image,
        roles: ['admin', 'editor', 'manager', 'operations'],
        moduleKey: 'assets',
      },
      {
        name: 'Visual AI',
        href: '/ppm/visual-ai',
        icon: WandSparkles,
        roles: ['admin', 'editor', 'manager'],
        moduleKey: 'visual_ai',
      },
    ],
  },
  {
    name: 'Network & Admin',
    roles: ['admin', 'approver', 'manager', 'finance', 'operations', 'viewer'],
    children: [
      {
        name: 'Vendors',
        href: '/vendors',
        icon: Store,
        roles: ['admin', 'approver', 'manager', 'finance', 'operations', 'viewer'],
        moduleKey: 'vendors',
      },
      {
        name: 'Approvals',
        href: '/approvals',
        icon: ClipboardCheck,
        roles: ['admin', 'approver', 'manager', 'finance'],
        moduleKey: 'approvals',
      },
    ],
  },
  {
    name: 'Marketing Hub',
    roles: ['admin', 'editor', 'manager', 'marketing', 'sales'],
    children: [
      {
        name: 'Promotions',
        href: '/promotions',
        icon: Gift,
        roles: ['admin', 'editor', 'manager', 'marketing'],
        moduleKey: 'promotions',
      },
      {
        name: 'Banners',
        href: '/banners',
        icon: Image,
        roles: ['admin', 'editor', 'manager', 'marketing'],
        moduleKey: 'banners',
      },
      {
        name: 'Promo Codes',
        href: '/promo-codes',
        icon: TicketPercent,
        roles: ['admin', 'editor', 'manager', 'marketing'],
        moduleKey: 'promo_codes',
      },
      {
        name: 'TravelHub CMS',
        href: '/content/travelhub',
        icon: Newspaper,
        roles: ['admin', 'editor', 'manager', 'marketing'],
        moduleKey: 'travelhub_cms',
      },
      {
        name: 'Visa CMS',
        href: '/content/visa',
        icon: ScrollText,
        roles: ['admin', 'editor', 'manager', 'marketing'],
        moduleKey: 'visa_cms',
      },
      {
        name: 'Campaigns',
        href: '/marketing/campaigns',
        icon: Megaphone,
        roles: ['admin', 'editor', 'manager', 'marketing'],
        moduleKey: 'campaigns',
      },
      {
        name: 'Automations',
        href: '/marketing/automations',
        icon: Workflow,
        roles: ['admin', 'editor', 'manager', 'marketing'],
        moduleKey: 'automations',
      },
      {
        name: 'Audiences',
        href: '/marketing/audiences',
        icon: Target,
        roles: ['admin', 'editor', 'manager', 'marketing', 'sales'],
        moduleKey: 'audiences',
      },
    ],
  },
];

const routePermissionRules: Array<{ path: string; moduleKey: string; exact?: boolean }> = [
  { path: '/', moduleKey: 'dashboard', exact: true },
  { path: '/mission-control', moduleKey: 'mission_control' },
  { path: '/command-center', moduleKey: 'command_center' },
  { path: '/ppm/analytics', moduleKey: 'analytics' },
  { path: '/crm/pipeline', moduleKey: 'sales_pipeline' },
  { path: '/crm/clients', moduleKey: 'clients' },
  { path: '/leads/followups', moduleKey: 'followups' },
  { path: '/leads', moduleKey: 'leads' },
  { path: '/quotes', moduleKey: 'quotes' },
  { path: '/bookings', moduleKey: 'bookings' },
  { path: '/escrow', moduleKey: 'escrow' },
  { path: '/refunds', moduleKey: 'refunds' },
  { path: '/invoices', moduleKey: 'invoices' },
  { path: '/trending', moduleKey: 'trending' },
  { path: '/trending-2', moduleKey: 'trending' },
  { path: '/packages', moduleKey: 'packages' },
  { path: '/themes', moduleKey: 'themes' },
  { path: '/catalog', moduleKey: 'catalog' },

  { path: '/stays', moduleKey: 'stays' },
  { path: '/cars', moduleKey: 'cars' },
  { path: '/flights', moduleKey: 'flights' },
  { path: '/cruises', moduleKey: 'cruises' },
  { path: '/destinations', moduleKey: 'destinations' },
  { path: '/experiences', moduleKey: 'experiences' },
  { path: '/route-map', moduleKey: 'route_map' },
  { path: '/assets', moduleKey: 'assets' },
  { path: '/ppm/visual-ai', moduleKey: 'visual_ai' },
  { path: '/vendors', moduleKey: 'vendors' },
  { path: '/approvals', moduleKey: 'approvals' },
  { path: '/promotions', moduleKey: 'promotions' },
  { path: '/banners', moduleKey: 'banners' },
  { path: '/promo-codes', moduleKey: 'promo_codes' },
  { path: '/content/travelhub', moduleKey: 'travelhub_cms' },
  { path: '/content/visa', moduleKey: 'visa_cms' },
  { path: '/marketing/campaigns', moduleKey: 'campaigns' },
  { path: '/marketing/automations', moduleKey: 'automations' },
  { path: '/marketing/audiences', moduleKey: 'audiences' },
  { path: '/seo', moduleKey: 'seo' },
  { path: '/careers', moduleKey: 'careers' },
  { path: '/settings/email-templates', moduleKey: 'email_templates' },
  { path: '/settings/users', moduleKey: 'users' },
  { path: '/settings/security', moduleKey: 'security_center' },
];

function getRouteModuleKey(pathname: string) {
  return routePermissionRules.find(({ path, exact }) =>
    exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`),
  )?.moduleKey;
}

type RoutableNavItem = NavItem & { href: string };
type MoonNavGroup = Omit<NavItem, 'children'> & { children: RoutableNavItem[] };
type MoonPosition = { x: number; y: number };
type MoonViewport = { width: number; height: number };
type MoonFanGeometry = {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  startAngle: number;
  endAngle: number;
  radiusStart: number;
  radiusStep: number;
  opensLeft: boolean;
  maxRadius: number;
};

const MOON_NAV_POSITION_KEY = 'moon_nav_position';
const MOON_NAV_V2_KEY = 'moon_nav_v2_enabled';
const MOON_SIDEBAR_PINNED_KEY = 'moon_sidebar_pinned';
const MOON_LAUNCHER_SIZE = 76;
const MOON_EDGE_GAP = 8;
const MOON_FAN_SPANS = [156, 132, 108, 86];

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function clampMoonPosition(position: MoonPosition, viewport: MoonViewport) {
  return {
    x: clampValue(position.x, MOON_EDGE_GAP, viewport.width - MOON_LAUNCHER_SIZE - MOON_EDGE_GAP),
    y: clampValue(position.y, MOON_EDGE_GAP, viewport.height - MOON_LAUNCHER_SIZE - MOON_EDGE_GAP),
  };
}

function getDefaultMoonPosition(viewport: MoonViewport) {
  return clampMoonPosition({ x: 12, y: viewport.height / 2 - MOON_LAUNCHER_SIZE / 2 }, viewport);
}

function isHrefActive(currentPath: string, href?: string) {
  return Boolean(href && (currentPath === href || (href !== '/' && currentPath.startsWith(href))));
}

function getRoutableChildren(item: NavItem): RoutableNavItem[] {
  return (item.children ?? []).filter((child): child is RoutableNavItem => Boolean(child.href));
}

function polarPoint(centerX: number, centerY: number, radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(radians),
    y: centerY + radius * Math.sin(radians),
  };
}

function describeArc(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarPoint(centerX, centerY, radius, startAngle);
  const end = polarPoint(centerX, centerY, radius, endAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) <= 180 ? 0 : 1;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function getRayLimit(center: MoonPosition, viewport: MoonViewport, angle: number, margin: number) {
  const direction = polarPoint(0, 0, 1, angle);
  let limit = Number.POSITIVE_INFINITY;

  if (direction.x > 0) {
    limit = Math.min(limit, (viewport.width - margin - center.x) / direction.x);
  } else if (direction.x < 0) {
    limit = Math.min(limit, (center.x - margin) / Math.abs(direction.x));
  }

  if (direction.y > 0) {
    limit = Math.min(limit, (viewport.height - margin - center.y) / direction.y);
  } else if (direction.y < 0) {
    limit = Math.min(limit, (center.y - margin) / Math.abs(direction.y));
  }

  return Math.max(0, limit);
}

function getArcSafeRadius(
  center: MoonPosition,
  viewport: MoonViewport,
  startAngle: number,
  endAngle: number,
  margin: number,
) {
  const samples = 32;
  let safeRadius = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= samples; index += 1) {
    const angle = startAngle + ((endAngle - startAngle) * index) / samples;
    safeRadius = Math.min(safeRadius, getRayLimit(center, viewport, angle, margin));
  }
  return safeRadius;
}

function getMoonFanGeometry(
  launcherCenter: MoonPosition,
  viewport: MoonViewport,
  ringCount: number,
  isMobile: boolean,
): MoonFanGeometry {
  const safeViewport = {
    width: Math.max(viewport.width, MOON_LAUNCHER_SIZE + MOON_EDGE_GAP * 2),
    height: Math.max(viewport.height, MOON_LAUNCHER_SIZE + MOON_EDGE_GAP * 2),
  };
  const center = {
    x: clampValue(
      launcherCenter.x,
      MOON_EDGE_GAP + MOON_LAUNCHER_SIZE / 2,
      safeViewport.width - MOON_EDGE_GAP - MOON_LAUNCHER_SIZE / 2,
    ),
    y: clampValue(
      launcherCenter.y,
      MOON_EDGE_GAP + MOON_LAUNCHER_SIZE / 2,
      safeViewport.height - MOON_EDGE_GAP - MOON_LAUNCHER_SIZE / 2,
    ),
  };
  const opensLeft = center.x > safeViewport.width / 2;
  const desiredRadiusStart = isMobile ? 72 : 84;
  const desiredRadiusStep = isMobile ? 28 : 40;
  const minRadiusStart = isMobile ? 52 : 60;
  const minRadiusStep = isMobile ? 22 : 28;
  const ringSlots = Math.max(0, ringCount - 1);
  const desiredMaxRadius = desiredRadiusStart + ringSlots * desiredRadiusStep;
  const minUsableRadius = minRadiusStart + ringSlots * minRadiusStep;
  const margin = isMobile ? 24 : 30;
  const verticalBias = clampValue(
    (safeViewport.height / 2 - center.y) / Math.max(safeViewport.height / 2, 1),
    -1,
    1,
  );
  const tilt = verticalBias * (isMobile ? 58 : 54);
  const preferredCenterAngle = opensLeft ? 180 - tilt : tilt;
  const centerAngleOffsets = [0, -12, 12, -24, 24, -36, 36, -48, 48, -60, 60];
  const motionAnglePad = 5;
  let selected: { startAngle: number; endAngle: number; safeRadius: number; span: number } | null =
    null;
  let fallback: { startAngle: number; endAngle: number; safeRadius: number; span: number } | null =
    null;

  for (const span of MOON_FAN_SPANS) {
    let bestForSpan: {
      startAngle: number;
      endAngle: number;
      safeRadius: number;
      span: number;
    } | null = null;

    for (const offset of centerAngleOffsets) {
      const centerAngle = preferredCenterAngle + offset;
      const startAngle = centerAngle - span / 2;
      const endAngle = centerAngle + span / 2;
      const safeRadius = getArcSafeRadius(
        center,
        safeViewport,
        startAngle - motionAnglePad,
        endAngle + motionAnglePad,
        margin,
      );
      const candidate = { startAngle, endAngle, safeRadius, span };

      if (!bestForSpan || safeRadius > bestForSpan.safeRadius) {
        bestForSpan = candidate;
      }
      if (
        !fallback ||
        safeRadius > fallback.safeRadius ||
        (safeRadius === fallback.safeRadius && span > fallback.span)
      ) {
        fallback = candidate;
      }
    }

    if (bestForSpan && bestForSpan.safeRadius >= minUsableRadius) {
      selected = bestForSpan;
      break;
    }
  }

  const fan = selected ??
    fallback ?? {
      startAngle: opensLeft ? 102 : -78,
      endAngle: opensLeft ? 258 : 78,
      safeRadius: desiredMaxRadius,
      span: 156,
    };
  const maxRadius = Math.max(0, Math.min(desiredMaxRadius, fan.safeRadius));
  let radiusStart = Math.min(desiredRadiusStart, maxRadius);

  if (ringSlots > 0 && maxRadius < radiusStart + ringSlots * minRadiusStep) {
    radiusStart = clampValue(
      maxRadius - ringSlots * minRadiusStep,
      Math.min(42, maxRadius),
      desiredRadiusStart,
    );
  }

  radiusStart = Math.max(0, Math.min(radiusStart, maxRadius));
  const radiusStep =
    ringSlots > 0
      ? Math.max(0, Math.min(desiredRadiusStep, (maxRadius - radiusStart) / ringSlots))
      : 0;

  return {
    width: safeViewport.width,
    height: safeViewport.height,
    centerX: center.x,
    centerY: center.y,
    startAngle: fan.startAngle,
    endAngle: fan.endAngle,
    radiusStart,
    radiusStep,
    opensLeft,
    maxRadius,
  };
}

function MoonNav({ items, currentPath }: { items: NavItem[]; currentPath: string }) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pausedRing, setPausedRing] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ width: 1024, height: 768 });
  const [position, setPosition] = useState<MoonPosition>({ x: 12, y: 260 });
  const dragState = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const hasLoadedPosition = React.useRef(false);

  useEffect(() => {
    const updateViewport = () => {
      const nextViewport = { width: window.innerWidth, height: window.innerHeight };
      setViewport(nextViewport);
      setPosition((current) => {
        if (!hasLoadedPosition.current) {
          hasLoadedPosition.current = true;
          const saved = localStorage.getItem(MOON_NAV_POSITION_KEY);
          if (saved) {
            try {
              const parsed = JSON.parse(saved) as MoonPosition;
              if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
                return clampMoonPosition(parsed, nextViewport);
              }
            } catch {
              localStorage.removeItem(MOON_NAV_POSITION_KEY);
            }
          }
          return getDefaultMoonPosition(nextViewport);
        }
        return clampMoonPosition(current, nextViewport);
      });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setPausedRing(null);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen]);

  const visibleGroups = React.useMemo<MoonNavGroup[]>(
    () =>
      items
        .map((item, index) => ({ ...item, children: getRoutableChildren(item), sortIndex: index }))
        .filter((item) => item.children.length > 0)
        .sort((a, b) => a.children.length - b.children.length || a.sortIndex - b.sortIndex),
    [items],
  );

  const launcherCenter = {
    x: position.x + MOON_LAUNCHER_SIZE / 2,
    y: position.y + MOON_LAUNCHER_SIZE / 2,
  };
  const geometry = getMoonFanGeometry(launcherCenter, viewport, visibleGroups.length, isMobile);

  const shellStyle = {
    left: `${position.x}px`,
    top: `${position.y}px`,
  } as React.CSSProperties;
  const panelStyle = {
    '--moon-origin-x': `${geometry.centerX}px`,
    '--moon-origin-y': `${geometry.centerY}px`,
    '--moon-glow-size': `${Math.min(Math.max(geometry.maxRadius * 2.25, 300), 720)}px`,
    width: geometry.width,
    height: geometry.height,
  } as React.CSSProperties;

  const closeMenu = () => {
    setIsOpen(false);
    setPausedRing(null);
  };
  const toggleMenu = () => {
    setIsOpen((open) => !open);
    setPausedRing(null);
  };
  const handleLauncherPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    };
    setIsDragging(false);
  };
  const handleLauncherPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) > 4) {
      drag.moved = true;
      setIsDragging(true);
      closeMenu();
    }
    if (drag.moved) {
      setPosition(
        clampMoonPosition({ x: drag.originX + deltaX, y: drag.originY + deltaY }, viewport),
      );
    }
  };
  const handleLauncherPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragState.current = null;
    setIsDragging(false);
    if (drag.moved) {
      const nextPosition = clampMoonPosition(
        {
          x: drag.originX + event.clientX - drag.startX,
          y: drag.originY + event.clientY - drag.startY,
        },
        viewport,
      );
      setPosition(nextPosition);
      localStorage.setItem(MOON_NAV_POSITION_KEY, JSON.stringify(nextPosition));
      return;
    }
    toggleMenu();
  };
  const handleLauncherPointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragState.current?.pointerId === event.pointerId) {
      dragState.current = null;
      setIsDragging(false);
    }
  };
  const handleLauncherKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleMenu();
    }
  };

  return (
    <>
      {isOpen && (
        <button aria-label="Close navigation" className="moon-nav-scrim" onClick={closeMenu} />
      )}
      <nav
        className={`moon-nav-shell ${isOpen ? 'moon-nav-open' : ''} ${geometry.opensLeft ? 'moon-nav-left' : 'moon-nav-right'} ${isDragging ? 'moon-nav-dragging' : ''} ${isMobile ? 'moon-nav-mobile' : ''}`}
        style={shellStyle}
        aria-label="Primary navigation"
      >
        <button
          type="button"
          className="moon-nav-launcher"
          aria-label="Open MooN navigation. Drag to move."
          aria-expanded={isOpen}
          onPointerDown={handleLauncherPointerDown}
          onPointerMove={handleLauncherPointerMove}
          onPointerUp={handleLauncherPointerUp}
          onPointerCancel={handleLauncherPointerCancel}
          onKeyDown={handleLauncherKeyDown}
        >
          <img src={logo} alt="" className="moon-nav-launcher-logo dark:invert" />
          <span className="sr-only">MooN navigation</span>
        </button>

        <div className="moon-nav-panel" style={panelStyle} aria-hidden={!isOpen}>
          <svg
            className="moon-nav-svg"
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            aria-hidden="true"
          >
            {visibleGroups.map((group, ringIndex) => {
              const radius = geometry.radiusStart + ringIndex * geometry.radiusStep;
              const directionClass = ringIndex % 2 === 0 ? 'moon-nav-forward' : 'moon-nav-reverse';
              const ringPaused = pausedRing === group.name;
              const groupActive = group.children.some((child) =>
                isHrefActive(currentPath, child.href),
              );
              return (
                <g key={group.name}>
                  <path
                    className={`moon-nav-arc-base ${groupActive ? 'moon-nav-arc-active' : ''}`}
                    d={describeArc(
                      geometry.centerX,
                      geometry.centerY,
                      radius,
                      geometry.startAngle,
                      geometry.endAngle,
                    )}
                  />
                  <path
                    className={`moon-nav-arc-flow ${directionClass} ${ringPaused ? 'is-paused' : ''}`}
                    d={describeArc(
                      geometry.centerX,
                      geometry.centerY,
                      radius,
                      geometry.startAngle,
                      geometry.endAngle,
                    )}
                  />
                </g>
              );
            })}
          </svg>

          {visibleGroups.map((group, ringIndex) => {
            const children = group.children;
            const radius = geometry.radiusStart + ringIndex * geometry.radiusStep;
            const ringPaused = pausedRing === group.name;
            const angleRange = geometry.endAngle - geometry.startAngle;
            return (
              <div
                key={group.name}
                className={`moon-nav-ring-items ${ringPaused ? 'is-paused' : ''}`}
                style={
                  {
                    transformOrigin: `${geometry.centerX}px ${geometry.centerY}px`,
                    '--moon-swing': ringIndex % 2 === 0 ? '7deg' : '-7deg',
                    '--moon-delay': `${ringIndex * -0.65}s`,
                    '--moon-duration': `${8 + ringIndex * 0.55}s`,
                  } as React.CSSProperties
                }
              >
                {children.map((child, childIndex) => {
                  const Icon = child.icon ?? Command;
                  const angle =
                    children.length === 1
                      ? 0
                      : geometry.startAngle + (angleRange * childIndex) / (children.length - 1);
                  const point = polarPoint(geometry.centerX, geometry.centerY, radius, angle);
                  const isActive = isHrefActive(currentPath, child.href);
                  return (
                    <button
                      key={child.name}
                      type="button"
                      title={`${group.name}: ${child.name}`}
                      aria-label={`${group.name}: ${child.name}`}
                      onClick={() => {
                        navigate({ to: child.href as any });
                        closeMenu();
                      }}
                      onMouseEnter={() => {
                        setPausedRing(group.name);
                        prefetchRoute(child.href);
                      }}
                      onMouseLeave={() =>
                        setPausedRing((current) => (current === group.name ? null : current))
                      }
                      onFocus={() => {
                        setPausedRing(group.name);
                        prefetchRoute(child.href);
                      }}
                      onBlur={() =>
                        setPausedRing((current) => (current === group.name ? null : current))
                      }
                      className={`moon-nav-link ${isActive ? 'moon-nav-link-active' : ''}`}
                      style={{ left: point.x, top: point.y } as React.CSSProperties}
                    >
                      <span className="moon-nav-link-button">
                        <Icon size={isMobile ? 15 : 16} />
                      </span>
                      <span className="moon-nav-link-label">
                        <small>{group.name}</small>
                        {child.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function RailNav({
  items,
  currentPath,
  userName,
  userEmail,
  badgeKey,
  assignedRoles,
  isPinned,
  onPinnedChange,
  onLogout,
}: {
  items: NavItem[];
  currentPath: string;
  userName?: string | null;
  userEmail?: string | null;
  badgeKey?: string | null;
  assignedRoles: string[];
  isPinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  onLogout: () => void;
}) {
  const navigate = useNavigate();

  return (
    <aside
      className={`group/sidebar fixed inset-y-0 left-0 z-40 hidden flex-col overflow-hidden border-r border-border/60 bg-card/95 shadow-sm backdrop-blur transition-[width] duration-200 ease-out md:flex ${
        isPinned ? 'w-60' : 'w-16 hover:w-60 focus-within:w-60'
      }`}
    >
      <div
        className={`flex h-14 shrink-0 items-center gap-2 border-b border-border/50 px-3 ${
          isPinned
            ? 'justify-between'
            : 'justify-center group-hover/sidebar:justify-between group-focus-within/sidebar:justify-between'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <img src={logo} alt="MooN" className="h-6 w-auto shrink-0 object-contain dark:invert" />
          <span
            className={`overflow-hidden whitespace-nowrap text-sm font-bold tracking-tight text-foreground transition-[max-width,opacity] duration-150 ${
              isPinned
                ? 'max-w-28 opacity-100'
                : 'max-w-0 opacity-0 group-hover/sidebar:max-w-28 group-hover/sidebar:opacity-100 group-focus-within/sidebar:max-w-28 group-focus-within/sidebar:opacity-100'
            }`}
          >
            Configs
          </span>
        </div>
        <button
          type="button"
          className={`flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-muted-foreground transition-[max-width,opacity,background-color,color] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            isPinned
              ? 'max-w-8 opacity-100'
              : 'max-w-0 opacity-0 group-hover/sidebar:max-w-8 group-hover/sidebar:opacity-100 group-focus-within/sidebar:max-w-8 group-focus-within/sidebar:opacity-100'
          }`}
          title={isPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
          aria-label={isPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
          aria-pressed={isPinned}
          onClick={(event) => {
            onPinnedChange(!isPinned);
            if (isPinned) event.currentTarget.blur();
          }}
        >
          {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Primary navigation">
        <div
          className={`transition-[margin] duration-150 ${
            isPinned
              ? 'space-y-5'
              : 'space-y-1 group-hover/sidebar:space-y-5 group-focus-within/sidebar:space-y-5'
          }`}
        >
          {items.map((group) => {
            const children = getRoutableChildren(group);
            if (children.length === 0) return null;

            return (
              <section key={group.name} className="space-y-1">
                <p
                  className={`overflow-hidden px-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/75 transition-[height,padding,opacity] duration-150 ${
                    isPinned
                      ? 'h-4 pb-1 opacity-100'
                      : 'h-0 pb-0 opacity-0 group-hover/sidebar:h-4 group-hover/sidebar:pb-1 group-hover/sidebar:opacity-100 group-focus-within/sidebar:h-4 group-focus-within/sidebar:pb-1 group-focus-within/sidebar:opacity-100'
                  }`}
                >
                  {group.name}
                </p>
                {children.map((child) => {
                  const Icon = child.icon ?? Command;
                  const isActive = isHrefActive(currentPath, child.href);
                  return (
                    <button
                      key={child.name}
                      type="button"
                      title={child.name}
                      className={`flex h-8 w-full items-center rounded-md px-3 text-left text-xs font-medium transition-[gap,justify-content,background-color,color,box-shadow] ${
                        isActive
                          ? 'bg-muted text-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                      } ${isPinned ? 'justify-start gap-3' : 'justify-center gap-0 group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-focus-within/sidebar:justify-start group-focus-within/sidebar:gap-3'}`}
                      onClick={(event) => {
                        event.currentTarget.blur();
                        navigate({ to: child.href as any });
                      }}
                      onMouseEnter={() => prefetchRoute(child.href)}
                      onFocus={() => prefetchRoute(child.href)}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span
                        className={`truncate transition-[max-width,opacity] duration-150 ${
                          isPinned
                            ? 'max-w-40 opacity-100'
                            : 'max-w-0 opacity-0 group-hover/sidebar:max-w-40 group-hover/sidebar:opacity-100 group-focus-within/sidebar:max-w-40 group-focus-within/sidebar:opacity-100'
                        }`}
                      >
                        {child.name}
                      </span>
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

function ProfileTravelBadge({ badgeKey }: { badgeKey?: string | null }) {
  const labels: Record<string, string> = {
    passport_elite: 'Passport Elite',
    route_architect: 'Route Architect',
    luxury_curator: 'Luxury Curator',
    summit_support: 'Summit Support',
    island_closer: 'Island Closer',
  };
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 64 64"
      role="img"
      aria-label={labels[badgeKey || 'passport_elite'] || 'Travel Badge'}
      className="shrink-0 drop-shadow"
    >
      <defs>
        <linearGradient
          id="profileTravelBadge"
          x1="8"
          x2="56"
          y1="8"
          y2="56"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#f7d77a" />
          <stop offset="0.52" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#profileTravelBadge)" />
      <circle
        cx="32"
        cy="32"
        r="23"
        fill="none"
        stroke="white"
        strokeOpacity="0.62"
        strokeWidth="2"
      />
      <path
        d="M18 37c8-13 18-18 30-20-5 8-9 17-10 29-3-6-7-9-12-9l-8 8 3-8h-3Z"
        fill="white"
        opacity="0.92"
      />
      <path
        d="M22 18h20M20 46h24"
        stroke="white"
        strokeOpacity="0.75"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CrmLayout({ children }: { children: React.ReactNode }) {
  const { user, initialized, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [notifications, setNotifications] = useState<LeadSubmissionRow[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isScreenExportOpen, setIsScreenExportOpen] = useState(false);
  const [isOrbitNavEnabled, setIsOrbitNavEnabled] = useState(false);
  const [isRailPinned, setIsRailPinned] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsNotifOpen(false);
        setIsProfileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    setIsOrbitNavEnabled(localStorage.getItem(MOON_NAV_V2_KEY) === 'true');
    setIsRailPinned(localStorage.getItem(MOON_SIDEBAR_PINNED_KEY) === 'true');
  }, []);

  // Warm the heaviest route chunks once the app is idle so first navigation to
  // Proposals / Route Map does not stall while the chunk downloads.
  useEffect(() => {
    prefetchHeavyRoutesWhenIdle();
  }, []);

  useEffect(() => {
    if (!user?.session_token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const loadLeads = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(loadLeads, 60_000);
        return;
      }

      let nextDelay = 30_000;
      try {
        const res = await adminGetLeads({
          data: {
            auth: {
              email: user.email,
              sessionToken: user.session_token || '',
            },
          },
        });
        const newLeads = res.filter((lead: LeadSubmissionRow) => lead.status === 'new');
        if (!cancelled) setNotifications(newLeads);
      } catch (err) {
        if (err instanceof OperationRequestError && err.status === 429) {
          nextDelay = Math.max(err.retryAfterMs || 0, 120_000);
        } else {
          console.error('Failed to load notifications:', err);
          nextDelay = 60_000;
        }
      } finally {
        if (!cancelled) timer = setTimeout(loadLeads, nextDelay);
      }
    };
    void loadLeads();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user?.email, user?.session_token]);

  const handleMarkAllRead = async () => {
    const listToMark = [...notifications];
    setNotifications([]);
    setIsNotifOpen(false);
    try {
      await Promise.all(
        listToMark.map((notif) =>
          adminUpdateLeadStatus({
            data: {
              auth: {
                email: user?.email || '',
                sessionToken: user?.session_token || '',
              },
              id: notif.id,
              status: 'contacted',
            },
          }),
        ),
      );
    } catch (err) {
      console.error('Failed to mark all lead notifications as read in DB:', err);
    }
  };

  const handleNotifClick = async (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setIsNotifOpen(false);
    try {
      await adminUpdateLeadStatus({
        data: {
          auth: {
            email: user?.email || '',
            sessionToken: user?.session_token || '',
          },
          id,
          status: 'contacted',
        },
      });
    } catch (err) {
      console.error('Failed to mark lead notification as read in DB:', err);
    }
    navigate({ to: '/leads' as any });
  };

  const handleNavModeToggle = () => {
    setIsOrbitNavEnabled((current) => {
      const next = !current;
      localStorage.setItem(MOON_NAV_V2_KEY, String(next));
      return next;
    });
    setIsNotifOpen(false);
    setIsProfileOpen(false);
  };

  const handleRailPinnedChange = (pinned: boolean) => {
    setIsRailPinned(pinned);
    localStorage.setItem(MOON_SIDEBAR_PINNED_KEY, String(pinned));
  };

  useEffect(() => {
    if (initialized && !user && location.pathname !== '/login') {
      navigate({ to: '/login', replace: true });
    }
  }, [initialized, user, navigate, location.pathname]);

  useEffect(() => {
    if (
      initialized &&
      user?.platformUserId &&
      user?.role === 'admin' &&
      user?.mfa?.enabled &&
      !user?.tenant?.onboardingCompletedAt &&
      !['/onboarding', '/settings/company-security'].includes(location.pathname)
    ) {
      navigate({ to: '/onboarding', replace: true });
    }
  }, [initialized, user, navigate, location.pathname]);

  useEffect(() => {
    if (
      initialized &&
      user?.platformUserId &&
      user?.mfa?.enrollmentRequired &&
      location.pathname !== '/settings/company-security'
    ) {
      navigate({ to: '/settings/company-security', replace: true });
    }
  }, [initialized, user, navigate, location.pathname]);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <img
            src={logo}
            alt="MooN"
            className="h-10 w-auto object-contain animate-pulse dark:invert"
          />
          <span className="text-sm text-muted-foreground">Loading MooNsConfigs...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const assignedRoles = user.roles?.length ? user.roles : [user.role];
  const isCommercialWorkspace = Boolean(user.platformUserId);
  const hasAnyRole = (allowedRoles: string[]) =>
    assignedRoles.some((role) => allowedRoles.includes(role));
  const hasModuleAccess = (moduleKey?: string) =>
    !moduleKey ||
    (!isCommercialWorkspace && assignedRoles.includes('admin')) ||
    !user.permissions ||
    user.permissions.includes(moduleKey);
  const currentModuleKey = getRouteModuleKey(location.pathname);
  const canAccessCurrentScreen = hasModuleAccess(currentModuleKey);
  const allowedNav = navItems
    .map((item) => {
      if (item.children) {
        return {
          ...item,
          children: item.children.filter((child) => hasModuleAccess(child.moduleKey)),
        };
      }
      return item;
    })
    .filter((item) => !item.children || item.children.length > 0);

  // Determine current breadcrumb
  let breadcrumbParts: string[] = [];
  navItems.forEach((item) => {
    if (item.href && item.href !== '/' && location.pathname.startsWith(item.href)) {
      breadcrumbParts = [item.name];
    }
    if (item.children) {
      item.children.forEach((child) => {
        if (
          child.href &&
          (location.pathname === child.href ||
            (child.href !== '/' && location.pathname.startsWith(child.href)))
        ) {
          breadcrumbParts = [item.name, child.name];
        }
      });
    }
  });
  if (breadcrumbParts.length === 0 && location.pathname === '/') {
    breadcrumbParts = ['Dashboard'];
  }

  return (
    <div className="h-screen overflow-hidden bg-muted/15">
      {isOrbitNavEnabled ? (
        <MoonNav items={allowedNav} currentPath={location.pathname} />
      ) : (
        <RailNav
          items={allowedNav}
          currentPath={location.pathname}
          userName={user.name}
          userEmail={user.email}
          badgeKey={user.badge_key}
          assignedRoles={assignedRoles}
          isPinned={isRailPinned}
          onPinnedChange={handleRailPinnedChange}
          onLogout={logout}
        />
      )}
      {/* ─── Sidebar ─── */}
      {/* ─── Main Content ─── */}
      <main
        className={`flex h-full flex-col overflow-hidden relative ${isOrbitNavEnabled ? '' : isRailPinned ? 'md:pl-60' : 'md:pl-16'}`}
      >
        {/* Header */}
        <header className="h-14 flex-shrink-0 bg-card/80 border-b border-border/50 flex items-center justify-between px-6 sticky top-0 z-10 backdrop-blur-md supports-[backdrop-filter]:bg-card/60">
          <div className="flex items-center gap-2 text-sm w-1/3">
            {breadcrumbParts.map((part, i) => (
              <React.Fragment key={part}>
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                <span
                  className={
                    i === breadcrumbParts.length - 1
                      ? 'font-semibold text-foreground'
                      : 'text-muted-foreground'
                  }
                >
                  {part}
                </span>
              </React.Fragment>
            ))}
          </div>

          <div className="hidden md:flex items-center justify-center gap-1 w-1/3">
            {hasModuleAccess('dashboard') && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate({ to: '/' as any })}
              >
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
            )}
            {hasModuleAccess('mission_control') && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate({ to: '/mission-control' as any })}
              >
                <Gauge className="mr-2 h-4 w-4" />
                Mission Control
              </Button>
            )}
            {hasModuleAccess('command_center') && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate({ to: '/command-center' as any })}
              >
                <Command className="mr-2 h-4 w-4" />
                Command Center
              </Button>
            )}
            {hasModuleAccess('analytics') && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate({ to: '/ppm/analytics' as any })}
              >
                <ChartPie className="mr-2 h-4 w-4" />
                Analytics
              </Button>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 w-1/3">
            {user.role === 'admin' && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2 px-2 xl:px-3"
                title="Export this screen's source"
                aria-label="Export Screen"
                onClick={() => {
                  setIsScreenExportOpen(true);
                  setIsNotifOpen(false);
                  setIsProfileOpen(false);
                }}
              >
                <Download className="h-4 w-4" />
                <span className="hidden xl:inline">Export Screen</span>
              </Button>
            )}
            <Button
              variant={isOrbitNavEnabled ? 'secondary' : 'ghost'}
              size="icon"
              className={`h-8 w-8 ${isOrbitNavEnabled ? 'text-foreground' : 'text-muted-foreground'}`}
              title={isOrbitNavEnabled ? 'Use left rail navigation' : 'Use orbit navigation'}
              aria-label={isOrbitNavEnabled ? 'Use left rail navigation' : 'Use orbit navigation'}
              aria-pressed={isOrbitNavEnabled}
              onClick={handleNavModeToggle}
            >
              <Orbit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              title="Search"
              onClick={() => {
                setIsSearchOpen(true);
                setIsNotifOpen(false);
                setIsProfileOpen(false);
              }}
            >
              <Search className="h-4 w-4" />
            </Button>
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground relative"
                title="Notifications"
                onClick={() => {
                  setIsNotifOpen((prev) => !prev);
                  setIsProfileOpen(false);
                }}
              >
                <Bell className="h-4 w-4" />
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive"></span>
                  </span>
                )}
              </Button>

              {isNotifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-border/85 bg-card p-4 shadow-xl z-50 text-left animate-slide-up">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b">
                    <span className="text-xs font-bold font-sans">Notifications</span>
                    {notifications.length > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[10px] text-primary font-semibold hover:underline"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic text-center py-4">
                        No new notifications
                      </p>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => handleNotifClick(notif.id)}
                          className="p-2.5 rounded-lg hover:bg-muted/60 border border-transparent hover:border-border/40 cursor-pointer transition-all"
                        >
                          <div className="flex justify-between items-start gap-1">
                            <span className="text-xs font-semibold">{notif.name}</span>
                            <span className="text-[9px] text-muted-foreground font-mono">
                              {new Date(notif.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            New request for{' '}
                            <span className="font-semibold text-foreground">
                              {notif.destination || 'Not Specified'}
                            </span>
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full p-0"
                title="Account"
                aria-expanded={isProfileOpen}
                onClick={() => {
                  setIsProfileOpen((prev) => !prev);
                  setIsNotifOpen(false);
                }}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/25 to-primary/5 text-sm font-bold text-primary shadow-sm">
                  {user.name?.[0]?.toUpperCase() || 'U'}
                </span>
              </Button>

              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl border border-border/85 bg-card p-4 shadow-xl z-50 text-left animate-slide-up">
                  <div className="flex items-center gap-3 border-b pb-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/25 to-primary/5 text-base font-bold text-primary">
                      {user.name?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{user.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 py-3">
                    <ProfileTravelBadge badgeKey={user.badge_key} />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Access
                      </p>
                      <p className="flex items-center gap-1 truncate text-xs capitalize text-foreground">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                        {assignedRoles.join(', ')}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-border/50 py-2">
                    {hasAnyRole(['admin']) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-muted-foreground text-xs h-9 hover:text-foreground"
                        onClick={() => {
                          setIsProfileOpen(false);
                          navigate({ to: '/platform-ops' as any });
                        }}
                      >
                        <Database size={14} className="mr-2 shrink-0" /> Business Operations
                      </Button>
                    )}
                    {isCommercialWorkspace && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-muted-foreground text-xs h-9 hover:text-foreground"
                        onClick={() => {
                          setIsProfileOpen(false);
                          navigate({ to: '/settings/billing' as any });
                        }}
                      >
                        <CreditCard size={14} className="mr-2 shrink-0" /> Billing &amp; Plan
                      </Button>
                    )}
                    {isCommercialWorkspace && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-muted-foreground text-xs h-9 hover:text-foreground"
                        onClick={() => {
                          setIsProfileOpen(false);
                          navigate({ to: '/settings/company-security' as any });
                        }}
                      >
                        <Shield size={14} className="mr-2 shrink-0" /> Company Security
                      </Button>
                    )}
                    {hasModuleAccess('seo') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-muted-foreground text-xs h-9 hover:text-foreground"
                        onClick={() => {
                          setIsProfileOpen(false);
                          navigate({ to: '/seo' as any });
                        }}
                      >
                        <SlidersHorizontal size={14} className="mr-2 shrink-0" /> Global Settings
                      </Button>
                    )}
                    {hasModuleAccess('users') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-muted-foreground text-xs h-9 hover:text-foreground"
                        onClick={() => {
                          setIsProfileOpen(false);
                          navigate({ to: '/settings/users' as any });
                        }}
                      >
                        <ContactRound size={14} className="mr-2 shrink-0" /> People & Access
                      </Button>
                    )}
                    {hasModuleAccess('security_center') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-muted-foreground text-xs h-9 hover:text-foreground"
                        onClick={() => {
                          setIsProfileOpen(false);
                          navigate({ to: '/settings/security' as any });
                        }}
                      >
                        <Shield size={14} className="mr-2 shrink-0" /> Security Center
                      </Button>
                    )}
                    {hasModuleAccess('email_templates') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-muted-foreground text-xs h-9 hover:text-foreground"
                        onClick={() => {
                          setIsProfileOpen(false);
                          navigate({ to: '/settings/email-templates' as any });
                        }}
                      >
                        <Mail size={14} className="mr-2 shrink-0" /> Email Templates
                      </Button>
                    )}
                    {hasModuleAccess('careers') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-muted-foreground text-xs h-9 hover:text-foreground"
                        onClick={() => {
                          setIsProfileOpen(false);
                          navigate({ to: '/careers' as any });
                        }}
                      >
                        <Briefcase size={14} className="mr-2 shrink-0" /> Careers
                      </Button>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground text-xs h-9 hover:text-destructive"
                    onClick={() => {
                      setIsProfileOpen(false);
                      logout();
                    }}
                  >
                    <LogOut size={14} className="mr-2 shrink-0" />
                    Sign Out
                  </Button>
                </div>
              )}
            </div>
          </div>
        </header>

        {isCommercialWorkspace &&
          user.subscription?.status === 'trialing' &&
          !user.subscription?.locked && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300/50 bg-amber-50 px-6 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
              <span>
                Enterprise trial · ends {new Date(user.subscription.trialEndsAt).toLocaleString()}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate({ to: '/settings/billing' as any })}
              >
                Choose a plan
              </Button>
            </div>
          )}

        <div className="flex-1 overflow-y-auto p-6 relative">
          <div className="h-full w-full">
            {isCommercialWorkspace &&
            user.subscription?.locked &&
            location.pathname !== '/settings/billing' ? (
              <div className="flex min-h-[60vh] items-center justify-center">
                <div className="max-w-lg rounded-xl border border-destructive/40 bg-card p-8 text-center shadow-sm">
                  <CreditCard className="mx-auto mb-3 h-10 w-10 text-destructive" />
                  <h2 className="text-xl font-semibold">Workspace access is locked</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Your trial or paid period has ended. Company data is retained for 90 days and is
                    never removed during a plan downgrade.
                  </p>
                  <Button
                    className="mt-5"
                    onClick={() => navigate({ to: '/settings/billing' as any })}
                  >
                    Restore access
                  </Button>
                </div>
              </div>
            ) : canAccessCurrentScreen ? (
              children
            ) : (
              <div className="flex min-h-[60vh] items-center justify-center">
                <div className="max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
                  <Shield className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Screen access restricted</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Your assigned role does not have permission to open this screen. Ask an
                    administrator to enable it under People &amp; Access → Role Permissions.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <GlobalSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      {user.role === 'admin' && (
        <ScreenExportDialog
          open={isScreenExportOpen}
          pathname={location.pathname}
          screenName={breadcrumbParts.at(-1) ?? 'Current screen'}
          onOpenChange={setIsScreenExportOpen}
        />
      )}
    </div>
  );
}
