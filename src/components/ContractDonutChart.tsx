import { useMemo, useState, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/costingCalculations';

export interface DonutSegment {
  name: string;
  value: number;
}

/* ── Shared colour maps ── */
const SEGMENT_COLORS: Record<string, string> = {
  'Labour': '#1F4E79',
  'Statutory On-costs': '#ED7D31',
  'Sundry Expenses': '#A5A5A5',
  'Profit': '#2E7D32',
};

const SERVICE_COLORS: Record<string, string> = {
  'Cleaning': '#2b9a9a',
  'Customer Service': '#4a7abf',
  'Security': '#7c4dba',
  'Maintenance': '#d4880f',
  'Management': '#c94040',
  'Landscape': '#3da34d',
};

const FALLBACK_COLOR = '#888888';

const SEGMENT_ORDER = ['Labour', 'Statutory On-costs', 'Sundry Expenses', 'Profit'];

/* ── Tooltip ── */
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const { name, value, payload: p } = payload[0];
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md text-xs">
      <div className="font-semibold mb-0.5">{name}</div>
      <div className="font-mono">{formatCurrency(value)}</div>
      <div className="text-muted-foreground">{p.pct}</div>
    </div>
  );
}

/* ── Single Donut (reusable) ── */
interface SingleDonutProps {
  chartData: { name: string; value: number; pct: string; color: string }[];
  centerTitle: string;
  centerValue: string;
  centerSub?: string;
  legendTitle: string;
}

function SingleDonut({ chartData, centerTitle, centerValue, centerSub, legendTitle }: SingleDonutProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const onEnter = useCallback((_: any, index: number) => setActiveIndex(index), []);
  const onLeave = useCallback(() => setActiveIndex(null), []);

  if (chartData.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-3 flex-1 min-w-[320px]">
      <div className="flex flex-col md:flex-row items-center gap-4 w-full">
        {/* Chart */}
        <div className="relative w-[240px] h-[240px] flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius="58%"
                outerRadius="85%"
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                stroke="none"
                paddingAngle={1}
                onMouseEnter={onEnter}
                onMouseLeave={onLeave}
                animationDuration={600}
                animationEasing="ease-out"
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={entry.color}
                    {...(index === 0 ? {
                      style: {
                        transform: 'translate(0px, -3px)',
                        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))',
                      }
                    } : {})}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Centre label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[10px] font-semibold text-muted-foreground leading-tight">{centerTitle}</span>
            <span className="text-sm font-bold font-mono leading-tight mt-0.5">{centerValue}</span>
            {centerSub && <span className="text-[9px] text-muted-foreground/70 mt-0.5">{centerSub}</span>}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-1.5 text-xs min-w-[140px]">
          <h3 className="font-semibold text-xs mb-1">{legendTitle}</h3>
          {chartData.map((entry, idx) => (
            <div
              key={entry.name}
              className={`flex items-center gap-2 py-0.5 rounded px-1 transition-colors ${activeIndex === idx ? 'bg-muted/40' : ''}`}
            >
              <span
                className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="flex-1 truncate">{entry.name}</span>
              <span className="font-mono font-medium tabular-nums">{entry.pct}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Main exported component ── */
interface Props {
  data: DonutSegment[];
  totalContractPrice: number;
  workforceData?: DonutSegment[];
  totalLabourCost?: number;
}

export function ContractDonutChart({ data, totalContractPrice, workforceData, totalLabourCost }: Props) {
  /* Direct Service Price donut */
  const priceData = useMemo(() => {
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    const sorted = [...data]
      .filter(d => d.value > 0)
      .sort((a, b) => {
        const ai = SEGMENT_ORDER.indexOf(a.name);
        const bi = SEGMENT_ORDER.indexOf(b.name);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    return sorted.map(d => ({
      ...d,
      pct: ((d.value / total) * 100).toFixed(1) + '%',
      color: SEGMENT_COLORS[d.name] ?? FALLBACK_COLOR,
    }));
  }, [data]);

  /* Workforce donut */
  const wfData = useMemo(() => {
    if (!workforceData || workforceData.length === 0) return [];
    const total = workforceData.reduce((s, d) => s + d.value, 0) || 1;
    return workforceData
      .filter(d => d.value > 0)
      .map(d => ({
        ...d,
        pct: ((d.value / total) * 100).toFixed(1) + '%',
        color: SERVICE_COLORS[d.name] ?? FALLBACK_COLOR,
      }));
  }, [workforceData]);

  if (priceData.length === 0) return null;

  return (
    <div className="flex flex-col md:flex-row items-start gap-6 w-full">
      <SingleDonut
        chartData={priceData}
        centerTitle="Direct Service Price"
        centerValue={formatCurrency(totalContractPrice)}
        centerSub="Cost Composition"
        legendTitle="Direct Service Breakdown"
      />
      {wfData.length > 0 && (
        <SingleDonut
          chartData={wfData}
          centerTitle="Total Labour Cost"
          centerValue={formatCurrency(totalLabourCost ?? 0)}
          centerSub="Workforce Allocation"
          legendTitle="Workforce Breakdown"
        />
      )}
    </div>
  );
}
