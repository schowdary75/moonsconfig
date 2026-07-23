import React from 'react';
import type { TransportMode } from './routeMapTypes';

/** Keep detailed artwork clear of the stop dots at both ends of short legs. */
export const MIN_TRANSPORT_ICON_PATH_LENGTH = 48;

/** Keep most vehicles compact while giving the wide aircraft enough map presence. */
const TRANSPORT_ICON_SCALE: Record<TransportMode, number> = {
  flight: 0.8,
  land: 0.66,
  rail: 0.6,
  cruise: 0.78,
};

interface TransportRouteIconProps {
  mode: TransportMode;
  color: string;
  x: number;
  y: number;
  angleDeg: number;
  /** Data URL of a user-uploaded SVG/PNG/WebP that replaces the built-in vehicle. */
  customIconUrl?: string;
}

/** Optical sizes keep narrow cars/trains compact while preserving aircraft/ship detail. */
const CUSTOM_ICON_SIZE: Record<TransportMode, number> = {
  flight: 34,
  land: 25,
  cruise: 34,
  rail: 25,
};

interface VehicleProps {
  color: string;
  id: string;
}

const halo = {
  fill: 'none',
  stroke: '#ffffff',
  strokeWidth: 4.5,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
  opacity: 0.96,
};

function VehicleDefs({ color, id }: VehicleProps) {
  return (
    <defs>
      <linearGradient id={`${id}-paint`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity=".55" />
        <stop offset=".2" stopColor={color} />
        <stop offset=".72" stopColor={color} />
        <stop offset="1" stopColor="#0f172a" stopOpacity=".78" />
      </linearGradient>
      <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#dff6ff" />
        <stop offset=".32" stopColor="#5f7588" />
        <stop offset="1" stopColor="#111827" />
      </linearGradient>
      <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset=".42" stopColor="#e7edf1" />
        <stop offset="1" stopColor="#8b99a6" />
      </linearGradient>
      <linearGradient id={`${id}-airframe`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset=".52" stopColor="#f8fbff" />
        <stop offset="1" stopColor="#dbe7ef" />
      </linearGradient>
      <linearGradient id={`${id}-car-paint`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f8fafc" />
        <stop offset=".28" stopColor="#aebbc7" />
        <stop offset=".7" stopColor="#64748b" />
        <stop offset="1" stopColor="#263445" />
      </linearGradient>
      <filter id={`${id}-shadow`} x="-35%" y="-35%" width="170%" height="170%">
        <feDropShadow dx=".7" dy="1.1" stdDeviation=".7" floodColor="#0f172a" floodOpacity=".38" />
      </filter>
    </defs>
  );
}

/** Detailed aircraft viewed from directly above, nose facing +x. */
function FlightVehicle({ id }: VehicleProps) {
  const body =
    'M19 0c0 1.2-1.1 2.1-2.8 2.5L7 4.4 1.1 15.8h-3.8L-.5 5.5l-8.1 1.7-3.4 4.5h-2.6l1.5-6.4-4.8-2V-3.3l4.8-2-1.5-6.4h2.6l3.4 4.5 8.1 1.7-2.2-10.3h3.8L7-4.4l9.2 1.9C17.9-2.1 19-1.2 19 0z';
  return (
    <g filter={`url(#${id}-shadow)`}>
      <path d={body} {...halo} />
      <path d={body} fill="none" stroke="#475569" strokeWidth="2" strokeLinejoin="round" />
      <path
        d={body}
        fill={`url(#${id}-airframe)`}
        stroke="#334155"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M18 0 6.2 1.3-8.5.9-15.2 1.8v-3.6l6.7.9 14.7-.4z" fill="#ffffff" fillOpacity=".9" />
      <path
        d="M14.8-1.5c1.2.3 2 .8 2.3 1.5-.3.7-1.1 1.2-2.3 1.5l-3.1.6v-4.2z"
        fill={`url(#${id}-glass)`}
      />
      <path
        d="M5.8-3.5 1 12.8M5.8 3.5 1-12.8M-8.7-4.8v9.6"
        fill="none"
        stroke="#64748b"
        strokeWidth=".9"
        opacity=".9"
      />
      <path d="M-7.7 0H9.8" stroke="#334155" strokeWidth="1.4" strokeLinecap="round" opacity=".9" />
    </g>
  );
}

/** Front-facing car viewed head-on: grille, headlights and windshield facing the viewer. */
function CarVehicle({ id }: VehicleProps) {
  return (
    <g filter={`url(#${id}-shadow)`}>
      {/* Wheels – placed behind the body */}
      <rect
        x="-14"
        y="-11"
        width="5"
        height="4"
        rx="1"
        fill="#111827"
        stroke="#ffffff"
        strokeWidth=".45"
      />
      <rect
        x="-14"
        y="7"
        width="5"
        height="4"
        rx="1"
        fill="#111827"
        stroke="#ffffff"
        strokeWidth=".45"
      />
      <rect
        x="9"
        y="-11"
        width="5"
        height="4"
        rx="1"
        fill="#111827"
        stroke="#ffffff"
        strokeWidth=".45"
      />
      <rect
        x="9"
        y="7"
        width="5"
        height="4"
        rx="1"
        fill="#111827"
        stroke="#ffffff"
        strokeWidth=".45"
      />

      {/* Main body – rounded rectangle */}
      <rect
        x="-12"
        y="-8.5"
        width="24"
        height="17"
        rx="4"
        fill={`url(#${id}-car-paint)`}
        stroke="#263445"
        strokeWidth="1"
      />

      {/* Hood / bonnet – front section */}
      <rect x="-10" y="-7" width="20" height="5" rx="2" fill="#4a5568" opacity=".4" />

      {/* Windshield – large front glass */}
      <path
        d="M-8 -1.5 L-6.5 3.5 L6.5 3.5 L8 -1.5 Z"
        fill={`url(#${id}-glass)`}
        stroke="#d9e3ea"
        strokeWidth=".5"
      />

      {/* Headlights */}
      <rect
        x="-10.5"
        y="-6"
        width="3.5"
        height="2.2"
        rx="1"
        fill="#fff7c2"
        stroke="#eab308"
        strokeWidth=".4"
      />
      <rect
        x="7"
        y="-6"
        width="3.5"
        height="2.2"
        rx="1"
        fill="#fff7c2"
        stroke="#eab308"
        strokeWidth=".4"
      />

      {/* Grille */}
      <rect
        x="-4"
        y="-6.5"
        width="8"
        height="3"
        rx="1"
        fill="#1e293b"
        stroke="#475569"
        strokeWidth=".4"
      />
      <line x1="-2" y1="-6.5" x2="-2" y2="-3.5" stroke="#64748b" strokeWidth=".5" />
      <line x1="0" y1="-6.5" x2="0" y2="-3.5" stroke="#64748b" strokeWidth=".5" />
      <line x1="2" y1="-6.5" x2="2" y2="-3.5" stroke="#64748b" strokeWidth=".5" />

      {/* Roof */}
      <rect x="-7" y="4" width="14" height="4" rx="2" fill="#64748b" opacity=".5" />

      {/* Side mirrors */}
      <ellipse cx="-12.5" cy="0" rx="1.5" ry="1" fill="#94a3b8" stroke="#475569" strokeWidth=".4" />
      <ellipse cx="12.5" cy="0" rx="1.5" ry="1" fill="#94a3b8" stroke="#475569" strokeWidth=".4" />

      {/* Center line highlight */}
      <line x1="0" y1="-7" x2="0" y2="8" stroke="#ffffff" strokeWidth=".4" opacity=".3" />
    </g>
  );
}

/** Long locomotive roof plan with bogies, cab glazing and pantograph. */
function TrainVehicle({ color, id }: VehicleProps) {
  const body =
    'M19 0c0 3.5-1.4 6.4-4 8.1-1.2.8-2.7 1.2-4.2 1.2h-25.3c-2.5 0-4.5-2-4.5-4.5v-9c0-2.5 2-4.5 4.5-4.5h25.3c1.5 0 3 .4 4.2 1.2 2.6 1.7 4 4.6 4 8.1z';
  return (
    <g filter={`url(#${id}-shadow)`}>
      <path d="M9-10.5h5.5v3H9zM9 7.5h5.5v3H9zM-14-10.5h6v3h-6zM-14 7.5h6v3h-6z" fill="#172033" />
      <path d={body} {...halo} />
      <path d={body} fill={`url(#${id}-paint)`} stroke="#4b1014" strokeWidth=".75" />
      <path
        d="M15.2-5.7c1 1.1 1.5 2.5 1.6 4.2H8.8v-5.9h2.4c1.5 0 2.9.6 4 1.7zM15.2 5.7c1-1.1 1.5-2.5 1.6-4.2H8.8v5.9h2.4c1.5 0 2.9-.6 4-1.7z"
        fill={`url(#${id}-glass)`}
        stroke="#dbe7ee"
        strokeWidth=".5"
      />
      <path
        d="M6.2-6.3h-7.5v12.6h7.5zM-3.5-6.3H-11v12.6h7.5z"
        fill="#e7edf1"
        fillOpacity=".93"
        stroke="#7f1d1d"
        strokeWidth=".55"
      />
      <path d="M4.6-4.6H.2v9.2h4.4zM-5-4.6h-4.4v9.2H-5z" fill="#334155" />
      <path d="m-1.5-3.8-5.8 7.6m0-7.6 5.8 7.6" stroke="#cbd5e1" strokeWidth=".8" />
      <path d="M-14.1-5.6v11.2M7.4-6.2V6.2" stroke="#ffffff" strokeWidth=".75" opacity=".75" />
      <path d="M17-3.8v1.8M17 2v1.8" stroke="#fff7c2" strokeWidth="1.5" strokeLinecap="round" />
    </g>
  );
}

/** Cruise ship with a dark hull, stepped white decks and rows of windows. */
function ShipVehicle({ color, id }: VehicleProps) {
  const hull = 'M22 0 10.5 11-13 9.5-19 4.5v-9l6-5 23.5-1.5z';
  return (
    <g filter={`url(#${id}-shadow)`}>
      <path
        d="M-17.5-5.3c-4.2-.8-7.3-2.6-11-5.4M-17.5 5.3c-4.2.8-7.3 2.6-11 5.4"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        opacity=".9"
      />
      <path d={hull} {...halo} />
      <path d={hull} fill={color} stroke="#172554" strokeWidth="1.1" strokeLinejoin="round" />
      <path
        d="m16.6 0-7.7 7.2-18.5-1.1-5.7-3.5v-5.2l5.7-3.5L8.9-7.2z"
        fill={`url(#${id}-metal)`}
        stroke="#cbd5e1"
        strokeWidth=".55"
      />
      <path
        d="m11.4 0-5 4.7-11.8-.8v-7.8l11.8-.8z"
        fill="#ffffff"
        stroke="#94a3b8"
        strokeWidth=".55"
      />
      <path
        d="M6-3.1v6.2M2-3.3v6.6M-2-3.3v6.6"
        stroke={color}
        strokeWidth="1.05"
        strokeLinecap="round"
      />
      <path d="m12-2.8 3.4 2.8-3.4 2.8z" fill="#28455f" stroke="#ffffff" strokeWidth=".45" />
      <rect
        x="-5.3"
        y="-2"
        width="3.1"
        height="4"
        rx=".8"
        fill="#f97316"
        stroke="#7c2d12"
        strokeWidth=".5"
      />
      <path d="M-7.8-4.6v9.2M-11.6-3.6v7.2" stroke="#475569" strokeWidth="1.2" />
      <path
        d="M-14.2-2h1.2M-14.2 2h1.2M-11-6.3h1.1M-8-6h1.1M-11 6.3h1.1M-8 6h1.1"
        stroke="#0f4c81"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <ellipse
        cx="7.8"
        cy="0"
        rx="1.8"
        ry="1.25"
        fill="#6dd5e7"
        stroke="#ffffff"
        strokeWidth=".45"
      />
    </g>
  );
}

const VEHICLES: Record<TransportMode, React.ComponentType<VehicleProps>> = {
  flight: FlightVehicle,
  land: CarVehicle,
  cruise: ShipVehicle,
  rail: TrainVehicle,
};

export function TransportRouteIcon({
  mode,
  color,
  x,
  y,
  angleDeg,
  customIconUrl,
}: TransportRouteIconProps) {
  const reactId = React.useId().replace(/:/g, '');
  const id = `route-vehicle-${mode}-${reactId}`;
  const Vehicle = VEHICLES[mode];

  // Only the aircraft rotates to follow the leg direction; every other vehicle
  // stays upright/viewer-facing like the ship.
  const rotate = mode === 'flight' ? ` rotate(${angleDeg.toFixed(1)})` : '';

  if (customIconUrl) {
    const size = CUSTOM_ICON_SIZE[mode];
    return (
      <g
        aria-hidden="true"
        data-transport-mode={mode}
        pointerEvents="none"
        transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})${rotate}`}
      >
        <image
          href={customIconUrl}
          x={-size / 2}
          y={-size / 2}
          width={size}
          height={size}
          preserveAspectRatio="xMidYMid meet"
        />
      </g>
    );
  }

  return (
    <g
      aria-hidden="true"
      data-transport-mode={mode}
      pointerEvents="none"
      transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})${rotate} scale(${TRANSPORT_ICON_SCALE[mode]})`}
    >
      <VehicleDefs color={color} id={id} />
      <Vehicle color={color} id={id} />
    </g>
  );
}
