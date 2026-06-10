import { useMemo, useState, useRef, useCallback } from 'react';
import { usePricingData } from '@/hooks/usePricingData';
import { FixedPriceBanner } from '@/components/FixedPriceBanner';
import { useDivisions } from '@/components/DivisionsSettings';
import { useRosterStore } from '@/contexts/RosterContext';
import { DAYS_OF_WEEK } from '@/types/roster';
import type { ServiceType, DayOfWeek } from '@/types/roster';
import { AlertTriangle, ChevronDown, ChevronUp, ChevronRight, Download, FileSpreadsheet } from 'lucide-react';
import HowItWorks from '@/components/HowItWorks';
import { HELP_CONTENT } from '@/data/helpContent';
import { fmtNum } from '@/lib/utils';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { getExportFileName, applySheetFormatting, boldLastRow, downloadWorkbook } from '@/lib/excelExport';

const WEEKS_PER_YEAR = 52.14;

const cellCls = "text-right px-2.5 py-1.5 font-mono text-xs align-middle";
const labelCls = "px-2.5 py-1.5 text-xs align-middle";
const headCls = "px-3 py-2 text-xs font-semibold text-center align-middle";
const stickyCol = "sticky left-0 z-20 border-r border-border shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]";

type ViewMode = 'division' | 'service' | 'task' | 'service-division' | 'service-task';
type PeriodMode = 'annual' | 'weekly';

const SERVICE_LABELS: Record<string, string> = {
  cleaning: 'Cleaning',
  'customer-service': 'Customer Service',
  security: 'Security',
  maintenance: 'Maintenance',
  landscape: 'Landscape',
  management: 'Management',
};

const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

interface BucketRow {
  label: string;
  labourCost: number;
  hours: number;
  share: number;
  statutory: number;
  sundry: number;
  adminProfit: number;
  pli: number;
  total: number;
  // Employment-type-aware costs for statutory allocation
  ftptCost: number;
  cleaningFtptCost: number;
  securityFtptCost: number;
}

const fmtHours = (v: number) => v === 0 ? '–' : fmtNum(v, 1);
const fmtAvg = (total: number, hours: number) => {
  if (hours === 0 || total === 0) return '–';
  return `$${fmtNum(total / hours, 2)}`;
};

const VIEW_LABELS: Record<ViewMode, string> = {
  division: 'By Division',
  service: 'By Service',
  task: 'By Task',
  'service-division': 'By Service + Division',
  'service-task': 'By Service + Task',
};

export default function DivisionBreakdown() {
  const {
    isLoading, fmt,
    operatorAnnualCosts,
    grandTotals,
    statutoryTotal, statutoryCalc,
    sundryTotalValue, sundryDisplayTotal, sundryCalc,
    pliValue,
    adminTotalValue,
    contractTotalAnnual,
    totalPerWeek, totalPerMonth, totalPerAnnum,
  } = usePricingData();

  const { operators, getRoster } = useRosterStore();
  const { divisions } = useDivisions();
  const [view, setView] = useState<ViewMode>('division');
  const [period, setPeriod] = useState<PeriodMode>('annual');
  const [warningExpanded, setWarningExpanded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expandedStatutory, setExpandedStatutory] = useState(false);
  const [expandedSundry, setExpandedSundry] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const isAnnual = period === 'annual';
  const divisor = isAnnual ? 1 : WEEKS_PER_YEAR;

  // Period-aware formatting helper
  const pv = useCallback((v: number) => fmt(v / divisor), [fmt, divisor]);

  // Detect unassigned operators with affected days
  const unassignedOperators = useMemo(() => {
    const opMap = new Map<string, { number: number; name: string; days: DayOfWeek[] }>();

    operators.forEach(op => {
      const roster = getRoster(op.id);
      if (!roster) return;

      const unassignedDays: DayOfWeek[] = [];
      DAYS_OF_WEEK.forEach(day => {
        const shift = roster.shifts[day];
        if (!shift) return;
        const hasWork = shift.startTime || shift.endTime;
        if (!hasWork) return;

        if (shift.segments && shift.segments.length > 1) {
          const hasUnassignedSeg = shift.segments.some((s: any) => !s.task || s.task === 'Unassigned');
          if (hasUnassignedSeg) unassignedDays.push(day);
        } else {
          const task = (shift as any).tasks || op.defaultTasks;
          if (!task || task === 'Unassigned') unassignedDays.push(day);
        }
      });

      if (unassignedDays.length > 0) {
        opMap.set(op.id, { number: op.number, name: op.name || '', days: unassignedDays });
      }
    });

    return [...opMap.values()].sort((a, b) => a.number - b.number);
  }, [operators, getRoster]);

  const hasUnassignedCost = useMemo(() => {
    if (view !== 'task') return false;
    return operatorAnnualCosts.some(oc => (oc.tasks === 'Unassigned') && oc.annualLabourCost > 0);
  }, [operatorAnnualCosts, view]);

  const nonLabourComponents = useMemo(() => ({
    statutory: statutoryTotal,
    sundry: sundryDisplayTotal,
    adminProfit: adminTotalValue,
    pli: 0,
  }), [statutoryTotal, sundryDisplayTotal, adminTotalValue]);

  const totalLabourCost = grandTotals.annualTotal;

  // Compute employment-type-aware totals for statutory allocation
  const etTotals = useMemo(() => {
    let totalFtpt = 0, totalCleaningFtpt = 0, totalSecurityFtpt = 0;
    operatorAnnualCosts.forEach(op => {
      if (op.employmentType !== 'casual') {
        totalFtpt += op.annualLabourCost;
        if (op.service === 'cleaning') totalCleaningFtpt += op.annualLabourCost;
        if (op.service === 'security') totalSecurityFtpt += op.annualLabourCost;
      }
    });
    return { totalFtpt, totalCleaningFtpt, totalSecurityFtpt };
  }, [operatorAnnualCosts]);

  // Statutory child items — must be before rows so we can compute statutory per bucket
  const statutoryChildren = useMemo(() => {
    return statutoryCalc.map(r => ({ id: r.id, label: r.label, total: r.value }));
  }, [statutoryCalc]);

  // Pure helper for employment-type-aware statutory share
  const LEAVE_IDS = useMemo(() => new Set(['anl', 'leave-loading', 'sl']), []);
  const getStatutoryShare = useCallback((childId: string, r: BucketRow) => {
    if (LEAVE_IDS.has(childId)) {
      return etTotals.totalFtpt > 0 ? r.ftptCost / etTotals.totalFtpt : 0;
    }
    if (childId === 'lsl-cleaning') {
      return etTotals.totalCleaningFtpt > 0 ? r.cleaningFtptCost / etTotals.totalCleaningFtpt : 0;
    }
    if (childId === 'lsl-security') {
      return etTotals.totalSecurityFtpt > 0 ? r.securityFtptCost / etTotals.totalSecurityFtpt : 0;
    }
    return r.share;
  }, [etTotals, LEAVE_IDS]);

  const computeBucketStatutory = useCallback((r: BucketRow) => {
    return statutoryChildren.reduce((sum, child) => sum + child.total * getStatutoryShare(child.id, r), 0);
  }, [statutoryChildren, getStatutoryShare]);

  // Build buckets based on view mode
  const rows: BucketRow[] = useMemo(() => {
    if (totalLabourCost === 0) return [];

    const buckets = new Map<string, { cost: number; hours: number; ftptCost: number; cleaningFtptCost: number; securityFtptCost: number }>();

    operatorAnnualCosts.forEach(op => {
      let key: string;
      if (view === 'division') {
        key = op.division || 'Unassigned';
      } else if (view === 'service') {
        key = op.service;
      } else if (view === 'task') {
        key = op.tasks || 'Unassigned';
      } else if (view === 'service-task') {
        key = `${op.service}|||${op.tasks || 'Unassigned'}`;
      } else {
        key = `${op.service}|||${op.division || 'Unassigned'}`;
      }
      const isFtpt = op.employmentType !== 'casual';
      const existing = buckets.get(key);
      if (existing) {
        existing.cost += op.annualLabourCost;
        existing.hours += op.annualHours;
        if (isFtpt) {
          existing.ftptCost += op.annualLabourCost;
          if (op.service === 'cleaning') existing.cleaningFtptCost += op.annualLabourCost;
          if (op.service === 'security') existing.securityFtptCost += op.annualLabourCost;
        }
      } else {
        buckets.set(key, {
          cost: op.annualLabourCost, hours: op.annualHours,
          ftptCost: isFtpt ? op.annualLabourCost : 0,
          cleaningFtptCost: isFtpt && op.service === 'cleaning' ? op.annualLabourCost : 0,
          securityFtptCost: isFtpt && op.service === 'security' ? op.annualLabourCost : 0,
        });
      }
    });

    // Order keys
    let orderedKeys: string[];
    const svcOrder = ['cleaning', 'customer-service', 'security', 'maintenance', 'landscape', 'management'];

    if (view === 'division') {
      const divOrder = [...divisions];
      orderedKeys = [...buckets.keys()].sort((a, b) => {
        if (a === 'Unassigned') return 1;
        if (b === 'Unassigned') return -1;
        const ai = divOrder.indexOf(a);
        const bi = divOrder.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    } else if (view === 'service') {
      orderedKeys = [...buckets.keys()].sort((a, b) => svcOrder.indexOf(a) - svcOrder.indexOf(b));
    } else if (view === 'task') {
      orderedKeys = [...buckets.keys()].sort((a, b) => {
        if (a === 'Unassigned') return 1;
        if (b === 'Unassigned') return -1;
        return a.localeCompare(b);
      });
    } else {
      orderedKeys = [...buckets.keys()].sort((a, b) => {
        const [sA] = a.split('|||');
        const [sB] = b.split('|||');
        const si = svcOrder.indexOf(sA) - svcOrder.indexOf(sB);
        if (si !== 0) return si;
        const dA = a.split('|||')[1];
        const dB = b.split('|||')[1];
        if (dA === 'Unassigned') return 1;
        if (dB === 'Unassigned') return -1;
        return dA.localeCompare(dB);
      });
    }

    return orderedKeys.map(key => {
      const bucket = buckets.get(key)!;
      const labour = bucket.cost;
      const hours = bucket.hours;
      const share = totalLabourCost > 0 ? labour / totalLabourCost : 0;

      let label: string;
      if (view === 'division') {
        label = key;
      } else if (view === 'service') {
        label = SERVICE_LABELS[key] || key;
      } else if (view === 'task') {
        label = key;
      } else {
        const [svc, sub] = key.split('|||');
        label = `${SERVICE_LABELS[svc] || svc} – ${sub}`;
      }

      const sundry = nonLabourComponents.sundry * share;
      const adminProfit = nonLabourComponents.adminProfit * share;

      const row: BucketRow = {
        label,
        labourCost: labour,
        hours,
        share,
        statutory: 0,
        sundry,
        adminProfit,
        pli: 0,
        total: 0,
        ftptCost: bucket.ftptCost,
        cleaningFtptCost: bucket.cleaningFtptCost,
        securityFtptCost: bucket.securityFtptCost,
      };
      // Compute statutory using employment-type-aware shares
      row.statutory = computeBucketStatutory(row);
      row.total = labour + row.statutory + sundry + adminProfit;
      return row;
    });
  }, [view, operatorAnnualCosts, totalLabourCost, nonLabourComponents, divisions, computeBucketStatutory]);

  // For grouped views (service+division, service+task), group rows by service
  const isGroupedView = view === 'service-division' || view === 'service-task';
  const isTransposedView = view === 'division' || view === 'service' || view === 'task';

  const groupedRows = useMemo(() => {
    if (!isGroupedView) return null;
    const groups: { service: string; serviceLabel: string; rows: BucketRow[]; serviceTotal: BucketRow }[] = [];
    const svcMap = new Map<string, BucketRow[]>();

    rows.forEach(row => {
      const dashIdx = row.label.indexOf(' – ');
      const svcLabel = dashIdx >= 0 ? row.label.substring(0, dashIdx) : row.label;
      const svcKey = Object.entries(SERVICE_LABELS).find(([, v]) => v === svcLabel)?.[0] || svcLabel;

      if (!svcMap.has(svcKey)) svcMap.set(svcKey, []);
      svcMap.get(svcKey)!.push(row);
    });

    const svcOrder = ['cleaning', 'customer-service', 'security', 'maintenance', 'landscape', 'management'];
    svcOrder.forEach(svc => {
      const svcRows = svcMap.get(svc);
      if (!svcRows || svcRows.length === 0) return;
      const serviceTotal: BucketRow = {
        label: `${SERVICE_LABELS[svc]} Total`,
        labourCost: svcRows.reduce((s, r) => s + r.labourCost, 0),
        hours: svcRows.reduce((s, r) => s + r.hours, 0),
        share: svcRows.reduce((s, r) => s + r.share, 0),
        statutory: svcRows.reduce((s, r) => s + r.statutory, 0),
        sundry: svcRows.reduce((s, r) => s + r.sundry, 0),
        adminProfit: svcRows.reduce((s, r) => s + r.adminProfit, 0),
        pli: 0,
        total: svcRows.reduce((s, r) => s + r.total, 0),
        ftptCost: svcRows.reduce((s, r) => s + r.ftptCost, 0),
        cleaningFtptCost: svcRows.reduce((s, r) => s + r.cleaningFtptCost, 0),
        securityFtptCost: svcRows.reduce((s, r) => s + r.securityFtptCost, 0),
      };
      groups.push({ service: svc, serviceLabel: SERVICE_LABELS[svc] || svc, rows: svcRows, serviceTotal });
    });

    return groups;
  }, [isGroupedView, rows]);

  // Period-aware labels
  const labourLabel = isAnnual ? 'Annual Labour Cost' : 'Weekly Labour Cost';
  const totalLabel = isAnnual ? 'Annual Total' : 'Weekly Total';


  // Sundry child items (each item's value allocated by share, plus PLI)
  const sundryChildren = useMemo(() => {
    const items = sundryCalc.map(r => ({ id: r.id, label: r.label, total: r.value }));
    // Add PLI if it has a value
    if (pliValue > 0) {
      items.push({ id: 'pli', label: 'Public Liability Insurance', total: pliValue });
    }
    return items;
  }, [sundryCalc, pliValue]);

  // Build metrics with expandable rows
  type MetricRow = {
    label: string;
    render: (r: BucketRow) => string;
    isChild?: boolean;
    isExpandable?: boolean;
    expanded?: boolean;
    onToggle?: () => void;
  };

  const metricsWithExpand: MetricRow[] = useMemo(() => {
    const result: MetricRow[] = [
      { label: 'hs', render: (r: BucketRow) => fmtHours(r.hours / divisor) },
      { label: labourLabel, render: (r: BucketRow) => pv(r.labourCost) },
      { label: 'Share %', render: (r: BucketRow) => `${(r.share * 100).toFixed(2)}%` },
    ];

    // Statutory parent
    result.push({
      label: 'Statutory',
      render: (r: BucketRow) => pv(computeBucketStatutory(r)),
      isExpandable: true,
      expanded: expandedStatutory,
      onToggle: () => setExpandedStatutory(prev => !prev),
    });

    // Statutory children
    if (expandedStatutory) {
      statutoryChildren.forEach(child => {
        result.push({
          label: child.label,
          render: (r: BucketRow) => {
            const allocated = child.total * getStatutoryShare(child.id, r);
            return pv(allocated);
          },
          isChild: true,
        });
      });
    }

    // Sundry parent
    result.push({
      label: 'Sundry',
      render: (r: BucketRow) => pv(r.sundry),
      isExpandable: true,
      expanded: expandedSundry,
      onToggle: () => setExpandedSundry(prev => !prev),
    });

    // Sundry children
    if (expandedSundry) {
      sundryChildren.forEach(child => {
        result.push({
          label: child.label,
          render: (r: BucketRow) => {
            const allocated = child.total * r.share;
            return pv(allocated);
          },
          isChild: true,
        });
      });
    }

    result.push(
      { label: 'Admin & Profit', render: (r: BucketRow) => pv(r.adminProfit) },
      { label: 'Avg $/h', render: (r: BucketRow) => fmtAvg(r.total, r.hours) },
      { label: totalLabel, render: (r: BucketRow) => pv(r.total) },
    );

    return result;
  }, [divisor, labourLabel, totalLabel, pv, expandedStatutory, expandedSundry, statutoryChildren, sundryChildren, getStatutoryShare, computeBucketStatutory]);

  // Keep original metrics for non-expandable contexts
  const metrics = useMemo(() => [
    { label: 'hs', render: (r: BucketRow) => fmtHours(r.hours / divisor) },
    { label: labourLabel, render: (r: BucketRow) => pv(r.labourCost) },
    { label: 'Share %', render: (r: BucketRow) => `${(r.share * 100).toFixed(2)}%` },
    { label: 'Statutory', render: (r: BucketRow) => pv(computeBucketStatutory(r)) },
    { label: 'Sundry', render: (r: BucketRow) => pv(r.sundry) },
    { label: 'Admin & Profit', render: (r: BucketRow) => pv(r.adminProfit) },
    { label: 'Avg $/h', render: (r: BucketRow) => fmtAvg(r.total, r.hours) },
    { label: totalLabel, render: (r: BucketRow) => pv(r.total) },
  ], [divisor, labourLabel, totalLabel, pv, computeBucketStatutory]);

  // Summary values based on period
  const summaryPerWeek = isAnnual ? totalPerWeek : contractTotalAnnual / WEEKS_PER_YEAR;
  const summaryPerMonth = isAnnual ? totalPerMonth : (contractTotalAnnual / WEEKS_PER_YEAR) * WEEKS_PER_YEAR / 12;
  const summaryPerAnnum = isAnnual ? totalPerAnnum : (contractTotalAnnual / WEEKS_PER_YEAR) * WEEKS_PER_YEAR;

  // --- Export handlers ---
  const handleDownloadImage = useCallback(async () => {
    if (!contentRef.current || exporting) return;
    setExporting(true);
    try {
      const el = contentRef.current;
      const noPrint = el.querySelectorAll('.no-print');
      noPrint.forEach(n => (n as HTMLElement).style.display = 'none');

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: el.scrollWidth,
      });

      noPrint.forEach(n => (n as HTMLElement).style.display = '');

      const link = document.createElement('a');
      let jobName = 'Project';
      try { const jd = JSON.parse(localStorage.getItem('cpq-job-details') || '{}'); jobName = jd?.jobName || 'Project'; } catch {}
      const periodLabel = isAnnual ? 'Annual' : 'Weekly';
      link.download = `Division-Breakdown-${VIEW_LABELS[view].replace(/\s+/g, '-')}-${periodLabel}-${jobName.replace(/[^a-zA-Z0-9]/g, '')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setExporting(false);
    }
  }, [exporting, view, isAnnual]);

  // Build rows for a specific view mode from operatorAnnualCosts
  const buildRowsForView = useCallback((v: ViewMode): BucketRow[] => {
    if (totalLabourCost === 0) return [];
    const buckets = new Map<string, { cost: number; hours: number; ftptCost: number; cleaningFtptCost: number; securityFtptCost: number }>();
    operatorAnnualCosts.forEach(op => {
      let key: string;
      if (v === 'division') key = op.division || 'Unassigned';
      else if (v === 'service') key = op.service;
      else if (v === 'task') key = op.tasks || 'Unassigned';
      else if (v === 'service-task') key = `${op.service}|||${op.tasks || 'Unassigned'}`;
      else key = `${op.service}|||${op.division || 'Unassigned'}`;
      const isFtpt = op.employmentType !== 'casual';
      const existing = buckets.get(key);
      if (existing) {
        existing.cost += op.annualLabourCost; existing.hours += op.annualHours;
        if (isFtpt) {
          existing.ftptCost += op.annualLabourCost;
          if (op.service === 'cleaning') existing.cleaningFtptCost += op.annualLabourCost;
          if (op.service === 'security') existing.securityFtptCost += op.annualLabourCost;
        }
      } else {
        buckets.set(key, {
          cost: op.annualLabourCost, hours: op.annualHours,
          ftptCost: isFtpt ? op.annualLabourCost : 0,
          cleaningFtptCost: isFtpt && op.service === 'cleaning' ? op.annualLabourCost : 0,
          securityFtptCost: isFtpt && op.service === 'security' ? op.annualLabourCost : 0,
        });
      }
    });
    const svcOrder = ['cleaning', 'customer-service', 'security', 'maintenance', 'landscape', 'management'];
    let orderedKeys: string[];
    if (v === 'division') {
      const divOrder = [...divisions];
      orderedKeys = [...buckets.keys()].sort((a, b) => {
        if (a === 'Unassigned') return 1; if (b === 'Unassigned') return -1;
        const ai = divOrder.indexOf(a); const bi = divOrder.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1; if (bi === -1) return -1;
        return ai - bi;
      });
    } else if (v === 'service') {
      orderedKeys = [...buckets.keys()].sort((a, b) => svcOrder.indexOf(a) - svcOrder.indexOf(b));
    } else if (v === 'task') {
      orderedKeys = [...buckets.keys()].sort((a, b) => { if (a === 'Unassigned') return 1; if (b === 'Unassigned') return -1; return a.localeCompare(b); });
    } else {
      orderedKeys = [...buckets.keys()].sort((a, b) => {
        const [sA] = a.split('|||'); const [sB] = b.split('|||');
        const si = svcOrder.indexOf(sA) - svcOrder.indexOf(sB);
        if (si !== 0) return si;
        const dA = a.split('|||')[1]; const dB = b.split('|||')[1];
        if (dA === 'Unassigned') return 1; if (dB === 'Unassigned') return -1;
        return dA.localeCompare(dB);
      });
    }
    return orderedKeys.map(key => {
      const bucket = buckets.get(key)!;
      const labour = bucket.cost; const hours = bucket.hours;
      const share = totalLabourCost > 0 ? labour / totalLabourCost : 0;
      let label: string;
      if (v === 'division') label = key;
      else if (v === 'service') label = SERVICE_LABELS[key] || key;
      else if (v === 'task') label = key;
      else { const [svc, sub] = key.split('|||'); label = `${SERVICE_LABELS[svc] || svc} – ${sub}`; }
      const sundry = nonLabourComponents.sundry * share;
      const adminProfit = nonLabourComponents.adminProfit * share;
      const row: BucketRow = { label, labourCost: labour, hours, share, statutory: 0, sundry, adminProfit, pli: 0, total: 0, ftptCost: bucket.ftptCost, cleaningFtptCost: bucket.cleaningFtptCost, securityFtptCost: bucket.securityFtptCost };
      row.statutory = computeBucketStatutory(row);
      row.total = labour + row.statutory + sundry + adminProfit;
      return row;
    });
  }, [operatorAnnualCosts, totalLabourCost, nonLabourComponents, divisions, computeBucketStatutory]);

  const handleExportExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();
    let jobName = 'Project';
    try { const jd = JSON.parse(localStorage.getItem('cpq-job-details') || '{}'); jobName = jd?.jobName || 'Project'; } catch {}

    const viewsToExport: ViewMode[] = ['division', 'service', 'task', 'service-division', 'service-task'];
    const periods: PeriodMode[] = ['annual', 'weekly'];

    viewsToExport.forEach(v => {
      const vRows = v === view ? rows : buildRowsForView(v);
      if (vRows.length === 0) return;

      const gt: BucketRow = {
        label: 'TOTAL', labourCost: vRows.reduce((s, r) => s + r.labourCost, 0),
        hours: vRows.reduce((s, r) => s + r.hours, 0), share: 1,
        statutory: vRows.reduce((s, r) => s + r.statutory, 0), sundry: vRows.reduce((s, r) => s + r.sundry, 0),
        adminProfit: vRows.reduce((s, r) => s + r.adminProfit, 0), pli: 0,
        total: vRows.reduce((s, r) => s + r.total, 0),
        ftptCost: vRows.reduce((s, r) => s + r.ftptCost, 0),
        cleaningFtptCost: vRows.reduce((s, r) => s + r.cleaningFtptCost, 0),
        securityFtptCost: vRows.reduce((s, r) => s + r.securityFtptCost, 0),
      };
      const allCols = [...vRows, gt];

      periods.forEach(p => {
        const d = p === 'annual' ? 1 : WEEKS_PER_YEAR;
        const lbl = p === 'annual' ? 'Annual' : 'Weekly';
        const labLbl = p === 'annual' ? 'Annual Labour Cost' : 'Weekly Labour Cost';
        const totLbl = p === 'annual' ? 'Annual Total' : 'Weekly Total';

        // Build metric rows: label + values for each column
        type MRow = { label: string; values: (string | number)[]; isBold?: boolean; isChild?: boolean };
        const metricRows: MRow[] = [];
        const ev = (val: number) => val / d;
        const fmtE = (val: number) => val === 0 ? '' : +(ev(val)).toFixed(2);
        const fmtH = (val: number) => val === 0 ? '' : +(ev(val)).toFixed(1);

        metricRows.push({ label: 'hs', values: allCols.map(r => fmtH(r.hours)) });
        metricRows.push({ label: labLbl, values: allCols.map(r => fmtE(r.labourCost)) });
        metricRows.push({ label: 'Share %', values: allCols.map(r => +(r.share * 100).toFixed(2)) });

        // Statutory parent
        metricRows.push({ label: 'Statutory', values: allCols.map(r => fmtE(computeBucketStatutory(r))), isBold: true });
        // Statutory children
        statutoryChildren.forEach(child => {
          metricRows.push({ label: `  ${child.label}`, values: allCols.map(r => fmtE(child.total * getStatutoryShare(child.id, r))), isChild: true });
        });

        // Sundry parent
        metricRows.push({ label: 'Sundry', values: allCols.map(r => fmtE(r.sundry)), isBold: true });
        // Sundry children
        sundryChildren.forEach(child => {
          metricRows.push({ label: `  ${child.label}`, values: allCols.map(r => fmtE(child.total * r.share)), isChild: true });
        });

        metricRows.push({ label: 'Admin & Profit', values: allCols.map(r => fmtE(r.adminProfit)) });
        metricRows.push({ label: 'Avg $/h', values: allCols.map(r => r.hours > 0 ? +(r.total / r.hours).toFixed(2) : '') });
        metricRows.push({ label: totLbl, values: allCols.map(r => fmtE(r.total)), isBold: true });

        // Transposed: first row = headers (Metric, col1, col2, ..., TOTAL)
        const colHeaders = ['Metric', ...vRows.map(r => r.label), 'TOTAL'];
        const aoa: any[][] = [colHeaders];
        metricRows.forEach(mr => {
          aoa.push([mr.label, ...mr.values]);
        });

        // Summary rows
        const sPW = contractTotalAnnual / WEEKS_PER_YEAR;
        aoa.push([]);
        aoa.push(['Total Direct Labour Price Per Week', ...Array(vRows.length).fill(''), +(sPW).toFixed(2)]);
        aoa.push(['Total Direct Labour Price Per Month', ...Array(vRows.length).fill(''), +(sPW * WEEKS_PER_YEAR / 12).toFixed(2)]);
        aoa.push(['Total Direct Labour Price Per Annum', ...Array(vRows.length).fill(''), +(contractTotalAnnual).toFixed(2)]);

        const ws = XLSX.utils.aoa_to_sheet(aoa);

        // Column widths
        ws['!cols'] = colHeaders.map((h, i) => ({ wch: i === 0 ? 30 : Math.max(String(h).length + 2, 16) }));

        // Apply currency format to value cells
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        for (let R = 0; R <= range.e.r; R++) {
          for (let C = 0; C <= range.e.c; C++) {
            const addr = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[addr]) continue;
            if (R === 0) {
              ws[addr].s = { font: { bold: true }, fill: { fgColor: { rgb: 'F3F4F6' } } };
            } else if (C === 0) {
              const mr = metricRows[R - 1];
              if (mr?.isBold) ws[addr].s = { font: { bold: true } };
            } else if (typeof ws[addr].v === 'number') {
              const mr = metricRows[R - 1];
              if (mr && mr.label === 'Share %') ws[addr].z = '0.00"%"';
              else if (mr && mr.label === 'hs') ws[addr].z = '0.0';
              else ws[addr].z = '$#,##0.00';
            }
          }
        }

        // Bold last metric row (total)
        const lastMetricR = metricRows.length; // 1-indexed row in sheet
        for (let C = 0; C <= range.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: lastMetricR, c: C });
          if (ws[addr]) ws[addr].s = { font: { bold: true } };
        }

        const sheetLabels: Record<ViewMode, string> = {
          division: 'By Division',
          service: 'By Service',
          task: 'By Task',
          'service-division': 'Svc-Division',
          'service-task': 'Svc-Task',
        };
        const sheetName = `${lbl} - ${sheetLabels[v]}`.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });
    });

    downloadWorkbook(wb, getExportFileName('DivisionBreakdown-All', jobName));
  }, [view, rows, buildRowsForView, statutoryChildren, sundryChildren, contractTotalAnnual, getStatutoryShare, computeBucketStatutory]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

  const grandTotal: BucketRow = {
    label: 'TOTAL',
    labourCost: rows.reduce((s, r) => s + r.labourCost, 0),
    hours: rows.reduce((s, r) => s + r.hours, 0),
    share: 1,
    statutory: rows.reduce((s, r) => s + r.statutory, 0),
    sundry: rows.reduce((s, r) => s + r.sundry, 0),
    adminProfit: rows.reduce((s, r) => s + r.adminProfit, 0),
    pli: 0,
    total: rows.reduce((s, r) => s + r.total, 0),
    ftptCost: rows.reduce((s, r) => s + r.ftptCost, 0),
    cleaningFtptCost: rows.reduce((s, r) => s + r.cleaningFtptCost, 0),
    securityFtptCost: rows.reduce((s, r) => s + r.securityFtptCost, 0),
  };

  const toggleOptions: { value: ViewMode; label: string }[] = [
    { value: 'division', label: 'By Division' },
    { value: 'service', label: 'By Service' },
    { value: 'task', label: 'By Task' },
    { value: 'service-division', label: 'By Service + Division' },
    { value: 'service-task', label: 'By Service + Task' },
  ];

  const baseColCount = 9;
  const statChildCount = expandedStatutory ? statutoryChildren.length : 0;
  const sundChildCount = expandedSundry ? sundryChildren.length : 0;
  const COL_COUNT = baseColCount + statChildCount + sundChildCount;

  // Helper to render standard row cells (with expandable stat/sundry sub-columns)
  const renderRowCells = (row: BucketRow, isTotalRow = false) => {
    const statChildCells = expandedStatutory
      ? statutoryChildren.map(child => (
          <td key={`stat-${child.id}`} className={`${cellCls} text-muted-foreground text-[11px]`}>{pv(child.total * getStatutoryShare(child.id, row))}</td>
        ))
      : null;
    const sundChildCells = expandedSundry
      ? sundryChildren.map(child => (
          <td key={`sund-${child.id}`} className={`${cellCls} text-muted-foreground text-[11px]`}>{pv(child.total * row.share)}</td>
        ))
      : null;

    return (
      <>
        <td className={cellCls}>{fmtHours(row.hours / divisor)}</td>
        <td className={cellCls}>{pv(row.labourCost)}</td>
        <td className={cellCls}>{isTotalRow && row.label === 'TOTAL' ? '100.00%' : `${(row.share * 100).toFixed(2)}%`}</td>
        <td className={cellCls}>{pv(row.statutory)}</td>
        {statChildCells}
        <td className={cellCls}>{pv(row.sundry)}</td>
        {sundChildCells}
        <td className={cellCls}>{pv(row.adminProfit)}</td>
        <td className={cellCls}>{fmtAvg(row.total, row.hours)}</td>
        <td className={cellCls}>{pv(row.total)}</td>
      </>
    );
  };

  const renderRow = (row: BucketRow, idx: number, indent = false) => {
    const rowBg = idx % 2 === 0 ? 'bg-background' : 'bg-muted';
    return (
      <tr key={idx} className={rowBg}>
        <td className={`${labelCls}${indent ? ' pl-6' : ''} ${stickyCol} ${rowBg} min-w-[180px]`}>{row.label}</td>
        {renderRowCells(row)}
      </tr>
    );
  };

  const renderTotalRow = (row: BucketRow, cls: string, labelCls2: string, totalBg = 'bg-muted') => (
    <tr className={cls}>
      <td className={`${labelCls} ${labelCls2} ${stickyCol} ${totalBg} min-w-[180px]`}>{row.label}</td>
      {renderRowCells(row, true)}
    </tr>
  );

  const firstColHeader = view === 'division' ? 'Division' : view === 'service' ? 'Service' : view === 'task' ? 'Task' : view === 'service-task' ? 'Service / Task' : 'Service / Division';

  const renderExpandableHeader = (label: string, expanded: boolean, onToggle: () => void) => (
    <th className={headCls}>
      <button onClick={onToggle} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
    </th>
  );

  // Transposed table renderer (used for division, service, task)
  const renderTransposedTable = () => (
    <div className="border border-border rounded-md overflow-hidden overflow-x-auto">
      <table className="border-collapse min-w-full">
        <thead>
          <tr className="bg-muted/40 border-b border-border">
            <th className={`${headCls} text-left ${stickyCol} min-w-[220px] bg-muted`}>Metric</th>
            {rows.map((row, i) => (
              <th key={i} className={`${headCls} min-w-[120px]`}>{row.label}</th>
            ))}
            <th className={`${headCls} min-w-[120px] font-bold`}>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {metricsWithExpand.map((metric, mIdx) => (
            <tr key={mIdx} className={`${metric.isChild ? 'bg-muted' : mIdx % 2 === 0 ? 'bg-background' : 'bg-muted'}`}>
              <td
                className={`${labelCls} ${metric.isChild ? 'pl-7 text-muted-foreground font-normal text-[11px]' : 'font-medium'} ${stickyCol} min-w-[220px] ${metric.isChild ? 'bg-muted' : mIdx % 2 === 0 ? 'bg-background' : 'bg-muted'}`}
              >
                {metric.isExpandable ? (
                  <button
                    onClick={metric.onToggle}
                    className="flex items-center gap-1 w-full text-left hover:text-primary transition-colors"
                  >
                    {metric.expanded
                      ? <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    }
                    {metric.label}
                  </button>
                ) : metric.label}
              </td>
              {rows.map((row, i) => (
                <td key={i} className={`${cellCls} ${metric.isChild ? 'text-muted-foreground text-[11px]' : ''}`}>{metric.render(row)}</td>
              ))}
              <td className={`${cellCls} ${metric.isChild ? 'text-muted-foreground text-[11px]' : 'font-semibold'}`}>
                {metric.label === 'Share %' ? '100.00%' : metric.render(grandTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Standard (non-transposed) table renderer for grouped views
  const renderStandardTable = () => (
    <div className="border border-border rounded-md overflow-hidden overflow-x-auto">
      <table className="border-collapse min-w-full">
        <thead>
          <tr className="bg-muted/40 border-b border-border">
            <th className={`${headCls} text-left ${stickyCol} min-w-[180px] bg-muted`}>{firstColHeader}</th>
            <th className={headCls}>hs</th>
            <th className={headCls}>{labourLabel}</th>
            <th className={headCls}>Share %</th>
            {renderExpandableHeader('Statutory', expandedStatutory, () => setExpandedStatutory(p => !p))}
            {expandedStatutory && statutoryChildren.map(child => (
              <th key={`sh-${child.id}`} className={`${headCls} text-muted-foreground text-[11px] font-normal min-w-[110px]`}>{child.label}</th>
            ))}
            {renderExpandableHeader('Sundry', expandedSundry, () => setExpandedSundry(p => !p))}
            {expandedSundry && sundryChildren.map(child => (
              <th key={`su-${child.id}`} className={`${headCls} text-muted-foreground text-[11px] font-normal min-w-[110px]`}>{child.label}</th>
            ))}
            <th className={headCls}>Admin & Profit</th>
            <th className={headCls}>Avg $/h</th>
            <th className={headCls}>{totalLabel}</th>
          </tr>
        </thead>
        <tbody>
          {isGroupedView && groupedRows ? (
            groupedRows.map(group => (
              <>
                <tr key={`hdr-${group.service}`} className="bg-muted border-t border-border">
                  <td className={`${labelCls} font-semibold text-foreground ${stickyCol} bg-muted min-w-[180px]`} colSpan={1}>{group.serviceLabel}</td>
                  <td colSpan={COL_COUNT - 1}></td>
                </tr>
                {group.rows.map((row, idx) => {
                  const subLabel = row.label.includes(' – ') ? row.label.split(' – ')[1] : row.label;
                    const rowBg = idx % 2 === 0 ? 'bg-background' : 'bg-muted';
                    return (
                    <tr key={`${group.service}-${idx}`} className={rowBg}>
                      <td className={`${labelCls} pl-6 ${stickyCol} ${rowBg} min-w-[180px]`}>{subLabel}</td>
                      {renderRowCells(row)}
                    </tr>
                  );
                })}
                {renderTotalRow(group.serviceTotal, 'border-t border-border bg-muted font-medium', 'pl-6 font-semibold', 'bg-muted')}
              </>
            ))
          ) : (
            rows.map((row, idx) => renderRow(row, idx))
          )}

          {/* Grand Total row */}
          {renderTotalRow(grandTotal, 'border-t-2 border-border bg-muted font-semibold', 'font-bold', 'bg-muted')}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <FixedPriceBanner />
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold">Division Breakdown</h1>
            <p className="text-muted-foreground text-sm">Annual direct labour price allocated by division, service, or both</p>
          </div>
          <HowItWorks {...HELP_CONTENT["division-breakdown"]} size="sm" />
        </div>
        <div className="flex gap-2 no-print">
          <button
            onClick={handleDownloadImage}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? 'Capturing…' : 'Download Image'}
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-muted transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export Excel
          </button>
        </div>
      </div>

      {/* View mode toggle */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit no-print">
        {toggleOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setView(opt.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === opt.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Annual / Weekly toggle */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit no-print">
        {(['annual', 'weekly'] as PeriodMode[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              period === p
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {p === 'annual' ? 'Annual' : 'Weekly'}
          </button>
        ))}
      </div>

      <div ref={contentRef}>
        {/* Unassigned warning */}
        {(view === 'task' || view === 'division') && (hasUnassignedCost || unassignedOperators.length > 0) && (
          <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 rounded-md p-3 mb-6 no-print">
            <button
              onClick={() => setWarningExpanded(prev => !prev)}
              className="flex items-center gap-2 w-full text-left"
            >
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Warning: {unassignedOperators.length} operator{unassignedOperators.length !== 1 ? 's have' : ' has'} unassigned task allocation
              </span>
              {warningExpanded
                ? <ChevronUp className="h-4 w-4 text-amber-600 dark:text-amber-400 ml-auto shrink-0" />
                : <ChevronDown className="h-4 w-4 text-amber-600 dark:text-amber-400 ml-auto shrink-0" />
              }
            </button>
            {warningExpanded && (
              <div className="mt-2 pl-6 space-y-1">
                {unassignedOperators.map(op => (
                  <div key={op.number} className="text-xs text-amber-700 dark:text-amber-400 flex items-baseline gap-1">
                    <span className="font-medium">Operator {op.number}</span>
                    {op.name && <span className="text-amber-600 dark:text-amber-500">({op.name})</span>}
                    <span className="text-amber-500 dark:text-amber-600">
                      – {op.days.map(d => DAY_LABELS[d]).join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Main table */}
        <section>
          {isTransposedView ? renderTransposedTable() : renderStandardTable()}
        </section>

        {/* Summary bar */}
        <section className="mt-8">
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
              <tbody>
                <tr className="bg-muted/20 border-b border-border">
                  <td className={`${labelCls} font-semibold w-[40%]`} colSpan={COL_COUNT - 1}>Total Direct Labour Price Per Week</td>
                  <td className={`${cellCls} font-semibold`}>{fmt(summaryPerWeek)}</td>
                </tr>
                <tr className="bg-muted/20 border-b border-border">
                  <td className={`${labelCls} font-semibold w-[40%]`} colSpan={COL_COUNT - 1}>Total Direct Labour Price Per Month</td>
                  <td className={`${cellCls} font-semibold`}>{fmt(summaryPerMonth)}</td>
                </tr>
                <tr className="bg-muted/40">
                  <td className={`${labelCls} font-bold w-[40%]`} colSpan={COL_COUNT - 1}>Total Direct Labour Price Per Annum</td>
                  <td className={`${cellCls} font-bold`}>{fmt(summaryPerAnnum)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
