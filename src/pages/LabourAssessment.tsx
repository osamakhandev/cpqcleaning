import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAssessment } from "@/contexts/AssessmentContext";
import { COMMERCIAL_TABS, PRODUCTION_RATE_NOTICE } from "@/data/laSeedData";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertTriangle } from "lucide-react";
import TabContent from "@/components/labour/TabContent";
import StartHere from "@/components/labour/StartHere";
import WendDetailerContent from "@/components/labour/WendDetailerContent";
import AssessmentImpactPanel from "@/components/labour/AssessmentImpactPanel";
import OverridesLog from "@/components/labour/OverridesLog";
import SuggestedRoster from "@/components/labour/SuggestedRoster";
import LaRosterSyncPanel from "@/components/labour/LaRosterSyncPanel";
import HowItWorks from "@/components/HowItWorks";
import { HELP_CONTENT } from "@/data/helpContent";

const VALID_TABS = new Set(["start-here", "tenancy-areas", "common-public", "detailer-periodics", "suggested-roster"]);

const LabourAssessmentPage = () => {
  const { getTabHours, isLoading } = useAssessment();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") ?? "";
  const activeTab = VALID_TABS.has(requestedTab) ? requestedTab : "start-here";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">Loading Labour Assessment…</p>
      </div>
    );
  }

  const displayTabs = COMMERCIAL_TABS.filter(t => t.id !== "start-here");
  const tabHours = displayTabs.map(tab => ({
    ...tab,
    hours: getTabHours(tab.id),
  }));

  return (
    <div>
      {/* Page title + How It Works */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold">Labour Assessment</h1>
            <p className="text-muted-foreground text-sm">Preliminary staffing model and draft roster from building information</p>
          </div>
          <HowItWorks {...HELP_CONTENT["labour-assessment"]} size="sm" />
        </div>
      </div>

      {/* Notice */}
      <div className="mb-3">
        <div className="bg-accent/50 border border-accent rounded-md p-2 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {PRODUCTION_RATE_NOTICE}
          </p>
        </div>
      </div>

      {/* Labour Assessment → Operators sync controls */}
      <LaRosterSyncPanel />

      <div className="flex gap-4">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}>
            <TabsList className="w-full justify-start h-auto flex-wrap gap-1 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-2 mb-3 sticky top-0 z-30 border-b border-border shadow-sm overflow-x-auto">
              <TabsTrigger
                value="start-here"
                className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md px-3 py-1.5 shrink-0"
              >
                Start Here
              </TabsTrigger>
              {tabHours.map(tab => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md px-3 py-1.5 shrink-0"
                >
                  {tab.label}
                  <span className="ml-1.5 font-mono text-[10px] opacity-70">{tab.hours.toFixed(1)}h</span>
                </TabsTrigger>
              ))}
              <TabsTrigger
                value="suggested-roster"
                className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md px-3 py-1.5 shrink-0"
              >
                Suggested Roster
              </TabsTrigger>
            </TabsList>

            <TabsContent value="start-here">
              <StartHere />
            </TabsContent>

            {displayTabs.map(tab => (
              <TabsContent key={tab.id} value={tab.id}>
                {tab.id === "detailer-periodics" ? (
                  <WendDetailerContent />
                ) : (
                  <TabContent tabId={tab.id} />
                )}
              </TabsContent>
            ))}
            <TabsContent value="suggested-roster">
              <SuggestedRoster />
            </TabsContent>
          </Tabs>

          {/* Overrides log */}
          <div className="mt-6">
            <OverridesLog />
          </div>
        </div>

        {/* Floating Assessment Impact panel (sticky on lg+, sheet on mobile) */}
        <AssessmentImpactPanel />
      </div>
    </div>
  );
};

export default LabourAssessmentPage;
