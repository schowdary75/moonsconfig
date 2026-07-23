import { ROUTE_STYLES, type TransportMode } from './routeMapTypes';

interface RouteLegendProps {
  /** Only show modes that are actually used, in this fixed order. */
  modes: TransportMode[];
  x: number;
  y: number;
}

const LEGEND_ORDER: TransportMode[] = ['land', 'flight', 'cruise', 'rail'];

/**
 * Brochure-style legend rendered as SVG (so it is captured in PNG/SVG export).
 * White rounded rectangle, route sample line on the left, uppercase label on the right.
 */
export function RouteLegend({ modes, x, y }: RouteLegendProps) {
  const shown = LEGEND_ORDER.filter((m) => modes.includes(m));
  if (shown.length === 0) return null;

  const rowH = 26;
  const padX = 16;
  const padY = 14;
  const sampleW = 46;
  const labelGap = 12;
  const width = 200;
  const height = padY * 2 + shown.length * rowH;

  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        rx={12}
        ry={12}
        fill="#ffffff"
        stroke="#d8d8d8"
        strokeWidth={1}
        style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.18))' }}
      />
      {shown.map((mode, i) => {
        const style = ROUTE_STYLES[mode];
        const cy = padY + i * rowH + rowH / 2;
        return (
          <g key={mode}>
            <line
              x1={padX}
              y1={cy}
              x2={padX + sampleW}
              y2={cy}
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              strokeDasharray={style.strokeDasharray || undefined}
              strokeLinecap="round"
            />
            <text
              x={padX + sampleW + labelGap}
              y={cy}
              fontSize={13}
              fontWeight={700}
              fill="#111111"
              dominantBaseline="central"
              fontFamily="system-ui, sans-serif"
              letterSpacing="0.5"
            >
              {style.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
