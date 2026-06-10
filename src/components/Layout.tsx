import { ReactNode, useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Users, Calendar, BarChart3, LayoutGrid, CalendarDays, FileSpreadsheet, DollarSign, Receipt, Package, ArrowLeftRight, ClipboardList, PieChart, Table2, FileText, HardHat, ChevronDown, Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScenarioSelector } from '@/components/ScenarioSelector';
import { GlobalHeader } from '@/components/GlobalHeader';
import { useProjectSync } from '@/hooks/useProjectSync';
import { usePageTracker } from '@/components/AutoRedirect';
import { SubmittedBanner } from '@/components/SubmittedOverlay';
import { usePlan } from '@/contexts/PlanContext';
import { canAccessRoute } from '@/lib/routeAccess';

interface LayoutProps {
  children: ReactNode;
}

const startHereNavItems = [
  { to: '/job-details', label: 'Job Details', icon: ClipboardList },
  { to: '/', label: 'Roster Details', icon: Users },
  { to: '/roster', label: 'Weekly Roster', icon: Calendar, badge: 'add segments' },
  { to: '/pricing/statutory', label: 'Labour Price Breakdown', icon: Receipt },
  { to: '/pricing/divisions', label: 'Division Breakdown', icon: PieChart },
  { to: '/pricing/sundry', label: 'Sundry Expenses', icon: Package },
  { to: '/pricing/additional', label: 'Other Services & Costs', icon: DollarSign },
  { to: '/pricing/detailed-results', label: 'Detailed Results', icon: Table2 },
];

const moreDetailsNavItems = [
  { to: '/weekly-board', label: 'Labour Deployment Graphs', icon: CalendarDays },
  { to: '/pricing/executive-summary', label: 'Executive Summary', icon: FileText },
  { to: '/detailed-summary', label: 'Detailed Summary', icon: FileSpreadsheet },
  { to: '/daily-board', label: 'Daily Board', icon: LayoutGrid },
  { to: '/results', label: 'Roster Results', icon: BarChart3 },
];

const moreDropdownItems = [
  { to: '/job-details', label: 'Start Here', icon: ClipboardList, isStartHere: true },
  { to: '/weekly-board', label: 'More Details', icon: Table2 },
  { to: '/pricing/executive-summary', label: 'Executive Summary', icon: FileText },
];

const labourAssessmentTabs = [
  { tab: 'start-here', label: 'Start Here' },
  { tab: 'tenancy-areas', label: 'Tenancy Areas' },
  { tab: 'common-public', label: 'Common & Public Areas' },
  { tab: 'detailer-periodics', label: "W'end / Detailer" },
  { tab: 'suggested-roster', label: 'Suggested Roster' },
];

const allPaths = [...startHereNavItems, ...moreDetailsNavItems].map(i => i.to);
const moreDetailsPaths = moreDetailsNavItems.map(i => i.to);
const startHerePaths = startHereNavItems.map(i => i.to);

function isMoreDetails(pathname: string) {
  if (startHerePaths.includes(pathname)) return false;
  return moreDetailsPaths.includes(pathname);
}

function getActiveGroupLabel(pathname: string) {
  if (moreDetailsPaths.includes(pathname)) return 'More Details';
  if (pathname === '/labour-assessment') return 'Labour Assessment';
  if (pathname === '/pricing/executive-summary') return 'Executive Summary';
  return 'Start Here';
}

// Module-level variable so the nav group override persists across Layout remounts
// (each route creates a new Layout instance, so useState would be lost on navigation)
let _navGroupOverride: 'startHere' | 'moreDetails' | null = null;

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { isSaving, lastSaved, saveNow } = useProjectSync();
  const { plan, inTrial } = usePlan();
  usePageTracker();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [laDropdownOpen, setLaDropdownOpen] = useState(false);
  const [navGroupOverride, _setNavGroupOverride] = useState<'startHere' | 'moreDetails' | null>(_navGroupOverride);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const laDropdownRef = useRef<HTMLDivElement>(null);

  const setNavGroupOverride = (v: 'startHere' | 'moreDetails' | null) => {
    _navGroupOverride = v;
    _setNavGroupOverride(v);
  };

  // Reset override when route changes to a non-shared route
  useEffect(() => {
    const isSharedRoute = startHerePaths.includes(location.pathname) && moreDetailsPaths.includes(location.pathname);
    if (!isSharedRoute) {
      setNavGroupOverride(null);
    }
  }, [location.pathname]);

  const inMore = navGroupOverride === 'moreDetails' ? true : navGroupOverride === 'startHere' ? false : isMoreDetails(location.pathname);
  const navItems = inMore ? moreDetailsNavItems : startHereNavItems;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (laDropdownRef.current && !laDropdownRef.current.contains(e.target as Node)) {
        setLaDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setDropdownOpen(false);
    setLaDropdownOpen(false);
  }, [location.pathname]);

  // Determine which dropdown item is "active" based on current page only
  function isDropdownItemActive(item: typeof moreDropdownItems[0]) {
    // "Start Here" is active only when on a start-here route that isn't shared with more-details
    if (item.label === 'Start Here') {
      return !inMore && startHerePaths.includes(location.pathname) && location.pathname !== '/labour-assessment' && location.pathname !== '/pricing/executive-summary';
    }
    // "More Details" is active only when on a more-details route that has its OWN dropdown entry handled elsewhere
    if (item.label === 'More Details') {
      return inMore && location.pathname !== '/pricing/executive-summary';
    }
    // Direct route match for Labour Assessment, Executive Summary, etc.
    return location.pathname === item.to;
  }

  function handleDropdownClick(item: typeof moreDropdownItems[0]) {
    if (item.label === 'Start Here') {
      setNavGroupOverride('startHere');
    } else if (item.label === 'More Details') {
      setNavGroupOverride('moreDetails');
    }
    setDropdownOpen(false);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Global Header (logo + job meta) */}
      <div className="sticky top-0 z-50">
        <GlobalHeader isSaving={isSaving} lastSaved={lastSaved} />
        <SubmittedBanner />

        {/* Navigation */}
        <header className="border-b border-[hsl(0,0%,15%)] bg-[hsl(0,0%,0%)]">
          <div className="container mx-auto px-4">
            <div className="flex h-12 items-center justify-between">
              <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <nav className="flex items-center gap-1">
                  {navItems.map((item) => {
                    const isActive = location.pathname === item.to;
                    const locked = !canAccessRoute(plan, inTrial, item.to);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={cn(
                          "flex items-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap",
                          isActive ?
                          "px-3 bg-[hsl(0,0%,12%)] text-white border-b-2 border-primary" :
                          locked ?
                          "px-[6px] text-[hsl(0,0%,45%)] hover:text-[hsl(0,0%,60%)] hover:bg-[hsl(0,0%,17%)]" :
                          "px-3 text-[hsl(0,0%,75%)] hover:text-white hover:bg-[hsl(0,0%,17%)]"
                        )}>
                        <item.icon className="h-3.5 w-3.5" />
                        {item.label}
                        {locked && <Lock className="h-3 w-3 ml-0.5" />}
                        {'badge' in item && (item as any).badge && (
                          <span className="ml-1 text-[10px] text-[hsl(0,0%,50%)] font-normal opacity-70">{(item as any).badge}</span>
                        )}
                      </Link>);
                  })}
                </nav>
              </div>

              <div className="flex items-center gap-2">
                {/* ScenarioSelector hidden for Beta — functionality preserved */}
                {/* <ScenarioSelector onScenarioChange={() => saveNow(true)} /> */}

                {/* More dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:bg-[hsl(0,0%,17%)] border border-[hsl(0,0%,25%)] transition-colors mx-0"
                  >
                    More
                    <ChevronDown className={cn("h-3.5 w-3.5 text-white transition-transform", dropdownOpen && "rotate-180")} />
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-[hsl(0,0%,20%)] bg-[hsl(0,0%,0%)] shadow-lg z-50 py-1">
                      {moreDropdownItems.map((item) => {
                        const active = isDropdownItemActive(item);
                        return active ? (
                          <div
                            key={item.label}
                            className={cn(
                              "flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-default text-[hsl(0,0%,40%)] bg-[hsl(0,0%,8%)]",
                              item.isStartHere && "font-semibold"
                            )}
                          >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                            <Check className="ml-auto h-3.5 w-3.5 text-[hsl(0,0%,40%)]" />
                          </div>
                        ) : (
                          <Link
                            key={item.label}
                            to={item.to}
                            onClick={() => handleDropdownClick(item)}
                            className={cn(
                              "flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-[hsl(0,0%,17%)]",
                              item.isStartHere ? "font-semibold text-white" :
                              !canAccessRoute(plan, inTrial, item.to) ? "text-[hsl(0,0%,45%)] hover:text-[hsl(0,0%,60%)]" :
                              "text-[hsl(0,0%,75%)] hover:text-white"
                            )}
                          >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                            {!item.isStartHere && !canAccessRoute(plan, inTrial, item.to) && (
                              <Lock className="ml-auto h-3.5 w-3.5" />
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Labour Assessment dropdown — promoted to primary nav */}
                <div className="relative" ref={laDropdownRef}>
                  <button
                    onClick={() => setLaDropdownOpen(!laDropdownOpen)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                      "bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-700 shadow-sm",
                      location.pathname === '/labour-assessment' && "ring-2 ring-emerald-300/40"
                    )}
                  >
                    <HardHat className="h-3.5 w-3.5" />
                    Labour Assessment
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", laDropdownOpen && "rotate-180")} />
                  </button>

                  {laDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-emerald-800 bg-[hsl(0,0%,0%)] shadow-lg z-50 py-1">
                      {labourAssessmentTabs.map((item) => {
                        const locked = !canAccessRoute(plan, inTrial, '/labour-assessment');
                        return (
                          <Link
                            key={item.tab}
                            to={`/labour-assessment?tab=${item.tab}`}
                            onClick={() => setLaDropdownOpen(false)}
                            className={cn(
                              "flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-emerald-950/40",
                              locked ? "text-[hsl(0,0%,45%)] hover:text-[hsl(0,0%,60%)]" : "text-[hsl(0,0%,85%)] hover:text-white"
                            )}
                          >
                            {item.label}
                            {locked && <Lock className="ml-auto h-3.5 w-3.5" />}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>
      </div>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>);

}
