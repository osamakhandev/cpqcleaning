import { useMemo } from 'react';

export interface Pie3DSlice {
  name: string;
  value: number;
  color: string;
}

interface Pie3DProps {
  data: Pie3DSlice[];
  width?: number;
  height?: number;
  depth?: number;
  tilt?: number;
  explode?: number;
}

/* ── colour helpers ── */
function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function parseColor(c: string): [number, number, number] {
  if (c.startsWith('#')) return parseHex(c);
  // hsl(h, s%, l%) → approximate RGB
  const m = c.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
  if (m) {
    const [h, s, l] = [+m[1], +m[2] / 100, +m[3] / 100];
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }
  return [128, 128, 128];
}

function darken(color: string, factor: number): string {
  const [r, g, b] = parseColor(color);
  return `rgb(${Math.round(r * factor)},${Math.round(g * factor)},${Math.round(b * factor)})`;
}

function toRgb(color: string): string {
  const [r, g, b] = parseColor(color);
  return `rgb(${r},${g},${b})`;
}

const DEG = Math.PI / 180;

export function Pie3D({
  data,
  width = 440,
  height = 310,
  depth = 30,
  tilt = 0.48,
  explode = 8,
}: Pie3DProps) {
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  const cx = width * 0.46;
  const cy = height * 0.38;
  const rx = width * 0.24;
  const ry = rx * tilt;

  /* ── compute slice angles ── */
  const slices = useMemo(() => {
    if (total === 0) return [];
    const result: {
      name: string;
      color: string;
      sa: number; // start angle (degrees, 0=right, CW)
      ea: number;
      percent: number;
      midAngle: number;
      explodeX: number;
      explodeY: number;
    }[] = [];
    let angle = -90;
    data.forEach(d => {
      const sweep = (d.value / total) * 360;
      const mid = angle + sweep / 2;
      result.push({
        name: d.name,
        color: d.color,
        sa: angle,
        ea: angle + sweep,
        percent: d.value / total,
        midAngle: mid,
        explodeX: explode * Math.cos(mid * DEG),
        explodeY: explode * Math.sin(mid * DEG) * tilt,
      });
      angle += sweep;
    });
    return result;
  }, [data, total, explode, tilt]);

  if (total === 0) return null;

  /* ── path builders ── */
  const ellipsePoint = (a: number, ecx: number, ecy: number) => ({
    x: ecx + rx * Math.cos(a * DEG),
    y: ecy + ry * Math.sin(a * DEG),
  });

  const topFacePath = (sa: number, ea: number, ecx: number, ecy: number) => {
    const p1 = ellipsePoint(sa, ecx, ecy);
    const p2 = ellipsePoint(ea, ecx, ecy);
    const large = ea - sa > 180 ? 1 : 0;
    return `M ${ecx} ${ecy} L ${p1.x} ${p1.y} A ${rx} ${ry} 0 ${large} 1 ${p2.x} ${p2.y} Z`;
  };

  const sideWallPath = (sa: number, ea: number, ecx: number, ecy: number) => {
    const steps = Math.max(4, Math.ceil((ea - sa) / 3));
    const top: string[] = [];
    const bot: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = sa + (ea - sa) * (i / steps);
      const p = ellipsePoint(a, ecx, ecy);
      top.push(`${p.x},${p.y}`);
      bot.unshift(`${p.x},${p.y + depth}`);
    }
    return `M ${top.join(' L ')} L ${bot.join(' L ')} Z`;
  };

  /* ── render order: back sides → back tops → front sides → front tops ── */
  // Split slices into segments that cross the 0°/360° visible boundary
  // "Back" = midAngle sin < 0 (upper half), "Front" = sin >= 0 (lower half, closer to viewer)
  const back = slices.filter(s => Math.sin(s.midAngle * DEG) < 0);
  const front = slices.filter(s => Math.sin(s.midAngle * DEG) >= 0);
  // Sort front by distance from viewer (draw farther ones first)
  front.sort((a, b) => Math.sin(a.midAngle * DEG) - Math.sin(b.midAngle * DEG));
  back.sort((a, b) => Math.sin(b.midAngle * DEG) - Math.sin(a.midAngle * DEG));

  const renderOrder = [...back, ...front];

  /* ── labels ── */
  const labels = slices.map(s => {
    const mid = s.midAngle;
    const lr = rx + 40;
    const lry = ry + 30;
    const lx = cx + s.explodeX + lr * Math.cos(mid * DEG);
    const ly = cy + s.explodeY + lry * Math.sin(mid * DEG);
    const ax = cx + s.explodeX + (rx + 6) * Math.cos(mid * DEG);
    const ay = cy + s.explodeY + (ry + 4) * Math.sin(mid * DEG);
    // Elbow point for leader line
    const elbowX = cx + s.explodeX + (rx + 22) * Math.cos(mid * DEG);
    const elbowY = cy + s.explodeY + (ry + 16) * Math.sin(mid * DEG);
    return { ...s, lx, ly, ax, ay, elbowX, elbowY };
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      style={{ overflow: 'visible' }}
      className="font-sans"
    >
      {/* Bottom rim (shadow ellipse) */}
      <ellipse
        cx={cx}
        cy={cy + depth + 2}
        rx={rx + 2}
        ry={ry + 2}
        fill="none"
        opacity={0}
      />

      {/* Render slices in painter's order */}
      {renderOrder.map((s, i) => {
        const ecx = cx + s.explodeX;
        const ecy = cy + s.explodeY;
        const sideColor = darken(s.color, 0.55);
        const sideHighlight = darken(s.color, 0.7);
        const faceColor = toRgb(s.color);

        return (
          <g key={`slice-${i}`}>
            {/* Side wall */}
            <path
              d={sideWallPath(s.sa, s.ea, ecx, ecy)}
              fill={sideColor}
              stroke={darken(s.color, 0.4)}
              strokeWidth={0.3}
            />
            {/* Side highlight strip (lighter band near top edge) */}
            <path
              d={sideWallPath(s.sa, s.ea, ecx, ecy)}
              fill="url(#sideShine)"
              opacity={0.25}
            />
            {/* Top face */}
            <path
              d={topFacePath(s.sa, s.ea, ecx, ecy)}
              fill={faceColor}
              stroke="#fff"
              strokeWidth={1}
            />
            {/* Subtle gradient overlay on top face for 3D sheen */}
            <path
              d={topFacePath(s.sa, s.ea, ecx, ecy)}
              fill="url(#topSheen)"
              opacity={0.3}
            />
          </g>
        );
      })}

      {/* Leader lines + labels */}
      {labels.map((l, i) => (
        <g key={`label-${i}`}>
          {/* Leader line: anchor → elbow → label */}
          <polyline
            points={`${l.ax},${l.ay} ${l.elbowX},${l.elbowY} ${l.lx},${l.ly}`}
            fill="none"
            stroke="#666"
            strokeWidth={0.8}
          />
          {/* Dot at anchor */}
          <circle cx={l.ax} cy={l.ay} r={1.5} fill="#666" />
          {/* Label text */}
          <text
            x={l.lx + (l.lx > cx ? 4 : -4)}
            y={l.ly - 5}
            textAnchor={l.lx > cx ? 'start' : 'end'}
            fontSize={9}
            fontWeight={500}
            fill="currentColor"
          >
            {l.name}
          </text>
          <text
            x={l.lx + (l.lx > cx ? 4 : -4)}
            y={l.ly + 7}
            textAnchor={l.lx > cx ? 'start' : 'end'}
            fontSize={9}
            fontWeight={700}
            fill="currentColor"
          >
            {(l.percent * 100).toFixed(1)}%
          </text>
        </g>
      ))}

      {/* Shared gradients */}
      <defs>
        <linearGradient id="topSheen" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.4} />
          <stop offset="50%" stopColor="#fff" stopOpacity={0} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.1} />
        </linearGradient>
        <linearGradient id="sideShine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.5} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.2} />
        </linearGradient>
      </defs>
    </svg>
  );
}
