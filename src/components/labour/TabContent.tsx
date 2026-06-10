import React from "react";
import { useAssessment } from "@/contexts/AssessmentContext";
import { ELEMENT_BASED_TABS, COMMERCIAL_TABS } from "@/data/laSeedData";
import ZoneCard from "./ZoneCard";
import ElementCard from "./ElementCard";
import TenantSpecialGroupCard from "./TenantSpecialGroupCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import HowItWorks from "@/components/HowItWorks";
import { HELP_CONTENT } from "@/data/helpContent";

const HELP_BY_TAB: Record<string, string> = {
  "tenancy-areas": "la-tenancy-areas",
  "common-public": "la-common-public",
};

interface TabContentProps {
  tabId: string;
}

const TabContent: React.FC<TabContentProps> = ({ tabId }) => {
  const { lineItems, buildingElements, tenantSpecialGroups, addTenantSpecialGroup, getTenantSpecialHours } = useAssessment();
  const helpKey = HELP_BY_TAB[tabId];
  const helpHeader = helpKey ? (
    <div className="flex justify-end mb-2">
      <HowItWorks {...HELP_CONTENT[helpKey]} size="sm" />
    </div>
  ) : null;

  // Element-based tabs
  if (ELEMENT_BASED_TABS.includes(tabId)) {
    // Tenancy Areas now consolidates per-tenant Special Services as a sub-group
    if (tabId === "tenancy-areas") {
      const standardElements = buildingElements.filter(el => el.tabMapping === "tenancy-areas");

      return (
        <div className="space-y-6">
          {helpHeader}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-1">
              Standard Tenancy Tasks
            </h3>
            {standardElements.map((el, idx) => (
              <ElementCard key={el.id} element={el} defaultExpanded={idx < 2} />
            ))}
            {standardElements.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No standard tenancy elements. Add elements on the "Start Here" tab.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-border pb-1">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tenant Special Services
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Additional cleaning services billed separately to specific tenants.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => addTenantSpecialGroup()}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Tenant Special Service
              </Button>
            </div>
            {/* ── Tenant Special Services Summary (top) ── */}
            {tenantSpecialGroups.length > 0 && (() => {
              const rows = tenantSpecialGroups.map(g => ({
                id: g.id,
                tenantName: g.tenantName || "(unnamed tenant)",
                location: g.location || "–",
                hours: g.included ? getTenantSpecialHours(g.id) : 0,
                included: g.included,
              }));
              const total = rows.reduce((s, r) => s + r.hours, 0);
              const fmt = (n: number) =>
                n > 0
                  ? n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : "–";
              return (
                <div className="space-y-2">
                  <div className="border-b border-border pb-1">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Tenant Special Services Summary
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Consolidated weekly hours from all tenant special services on this page.
                    </p>
                  </div>
                  <div className="border border-border rounded-md overflow-hidden bg-card">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tenant Name</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Floor / Level / Location</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Hours / Week</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={r.id} className={`border-t border-border ${r.included ? "" : "opacity-50"}`}>
                            <td className="px-3 py-1.5">{r.tenantName}</td>
                            <td className="px-3 py-1.5">{r.location}</td>
                            <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmt(r.hours)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-border bg-muted/30">
                          <td colSpan={2} className="px-3 py-2 font-semibold">
                            Total Tenant Special Services Hours
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                            {total.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} hrs/week
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {tenantSpecialGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center italic">
                No tenant special services. Click "Add Tenant Special Service" to add one.
              </p>
            ) : (
              <div className="space-y-3">
                {tenantSpecialGroups.map(g => (
                  <TenantSpecialGroupCard key={g.id} group={g} />
                ))}
              </div>
            )}
          </div>

        </div>
      );
    }

    const tabElements = buildingElements.filter(el => el.tabMapping === tabId);
    return (
      <div className="space-y-2">
        {helpHeader}
        {tabElements.map((el, idx) => (
          <ElementCard
            key={el.id}
            element={el}
            defaultExpanded={idx < 2}
          />
        ))}
        {tabElements.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No building elements for this tab. Add elements on the "Start Here" tab.
          </p>
        )}
      </div>
    );
  }

  // Line-item-based tabs (support-roles, detailer-periodics)
  const tabConfig = COMMERCIAL_TABS.find(t => t.id === tabId);
  if (!tabConfig) return null;

  const zonesWithItems = tabConfig.zones.filter(zone =>
    lineItems.some(li => li.tabMapping === tabId && li.zone === zone)
  );

  return (
    <div className="space-y-2">
      {zonesWithItems.map((zone, idx) => {
        const zoneItems = lineItems.filter(li => li.tabMapping === tabId && li.zone === zone);
        return (
          <ZoneCard
            key={zone}
            zone={zone}
            tabId={tabId}
            items={zoneItems}
            defaultExpanded={idx < 2}
          />
        );
      })}
      {zonesWithItems.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">No tasks configured for this tab.</p>
      )}
    </div>
  );
};

export default TabContent;
