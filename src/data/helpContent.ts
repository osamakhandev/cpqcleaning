import type { HowItWorksProps } from "@/components/HowItWorks";

type HelpEntry = Omit<HowItWorksProps, "helpKey"> & { helpKey: string };

export const HELP_CONTENT: Record<string, HelpEntry> = {
  "job-details": {
    helpKey: "job-details",
    title: "How Job Details works",
    purpose: "Create the job and establish the core project settings used by every downstream module.\n\nFor commercial buildings, CPQ can generate a preliminary labour assessment and ballpark cleaning price from GFA alone. This is ideal for early-stage tender reviews, budget estimates and go/no-go decisions before detailed site information becomes available.",
    userAction: [
      "Enter project name, client, state/territory and award assumptions.",
      "Confirm contract term, start date and pricing scenario.",
      "Set GFA, building levels and other base building information.",
    ],
    cpqUses: [
      "Drives wage tables (state/territory), LSL and payroll thresholds.",
      "Provides GFA and building data to Labour Assessment.",
      "Sets contract duration used by fixed-price escalation and leap-year logic.",
    ],
    estimatorNote: "Changes here cascade across the whole project. Review before generating a roster or pricing.",
    workflow: "Job Details → Operators' Details → Labour Assessment",
  },
  "roster-details": {
    helpKey: "roster-details",
    title: "How Operators' Details works",
    purpose: "Define each operator: employment type, wage assumptions, service codes and shift patterns.",
    userAction: [
      "Add operators with FT / PT / Casual employment type.",
      "Set service code, level and base wage assumptions.",
      "Review default Monday–Friday shift template before customising in Weekly Roster.",
    ],
    cpqUses: [
      "Wage data feeds Labour Price Breakdown and Sundry costs.",
      "Operator list becomes the source of truth for Weekly Roster, Daily Board and Executive Summary workforce counts.",
    ],
    estimatorNote: "Roles flagged as LA-managed are overwritten by Labour Assessment. Freeze Roster converts them to manual.",
    workflow: "Operators' Details → Weekly Roster → Labour Price Breakdown",
  },
  "weekly-roster": {
    helpKey: "weekly-roster",
    title: "How Weekly Roster works",
    purpose: "Create or review operator shifts and assigned work across a typical Monday–Sunday week.",
    userAction: [
      "Adjust shift start/finish (HHMM auto-formats to HH:MM).",
      "Add segments to split work across divisions or services.",
      "Resolve any roster warnings (FT max hours, consecutive days off, break rules).",
    ],
    cpqUses: [
      "Calculates paid/unpaid breaks and total worked hours.",
      "Applies cleaning/CS, security and landscape rate bands per shift.",
      "Feeds total labour hours and costs into Labour Price Breakdown.",
    ],
    estimatorNote: "30-min break applies to shifts >4.5h. Unpaid only if fully within 06:00–18:00.",
    workflow: "Operators' Details → Weekly Roster → Labour Price Breakdown",
  },
  "labour-price-breakdown": {
    helpKey: "labour-price-breakdown",
    title: "How Labour Price Breakdown works",
    purpose: "Convert weekly labour hours into wages, allowances, leave loadings and on-costs.",
    userAction: [
      "Review statutory on-costs (super, workers comp, payroll tax, LSL).",
      "Adjust admin and profit margin assumptions.",
      "Check allowance totals (toilet, broken shift, first aid, etc.).",
    ],
    cpqUses: [
      "Annualises labour using 52.14 weeks/yr (or casual WeeksPerYearRequired).",
      "Applies margin-based admin/profit formula to derive Total Direct Labour Price.",
    ],
    estimatorNote: "Superannuation base = Labour + ANL + LL + SL. LSL is explicitly excluded.",
    workflow: "Weekly Roster → Labour Price Breakdown → Division Breakdown",
  },
  "division-breakdown": {
    helpKey: "division-breakdown",
    title: "How Division Breakdown works",
    purpose: "Analyse how labour cost is allocated across service areas or commercial divisions.",
    userAction: [
      "Review division-level hours and costs.",
      "Confirm segment allocations from Weekly Roster look correct.",
    ],
    cpqUses: [
      "Proportionally splits operator cost based on segment hours.",
      "Feeds division totals to Executive Summary charts.",
    ],
    workflow: "Labour Price Breakdown → Division Breakdown → Executive Summary",
  },
  "sundry-expenses": {
    helpKey: "sundry-expenses",
    title: "How Sundry Expenses works",
    purpose: "Capture indirect operating costs added on top of labour: chemicals, fuel, comms, repairs, uniforms.",
    userAction: [
      "Enter or override sundry line items.",
      "Confirm base figures match labour + statutory totals.",
    ],
    cpqUses: [
      "Adds sundry totals into the final price build-up.",
      "Some items recalc live from Labour + Statutory base.",
    ],
    workflow: "Labour Price Breakdown → Sundry Expenses → Detailed Results",
  },
  "other-services-costs": {
    helpKey: "other-services-costs",
    title: "How Other Services & Costs works",
    purpose: "Add periodic and ad-hoc services: sanitary, consumables, peak/Christmas trade, public holidays.",
    userAction: [
      "Enter frequencies, quantities and rates for each service.",
      "Toggle items in/out as required for this tender.",
    ],
    cpqUses: [
      "Each service has its own pricing model (cost, markup or margin).",
      "Totals flow through to Executive Summary as separate commercial segments.",
    ],
    workflow: "Labour Price Breakdown → Other Services & Costs → Executive Summary",
  },
  "detailed-results": {
    helpKey: "detailed-results",
    title: "How Detailed Results works",
    purpose: "Extended per-operator cost breakdown showing every component feeding the price.",
    userAction: [
      "Use to verify costs at the operator level.",
      "Cross-check totals against Labour Price Breakdown.",
    ],
    cpqUses: ["Aggregates operator-level outputs into pricing summaries."],
    workflow: "Labour Price Breakdown → Detailed Results → Executive Summary",
  },
  "executive-summary": {
    helpKey: "executive-summary",
    title: "How Executive Summary works",
    purpose: "Final pricing summary and management overview ready for tender submission.",
    userAction: [
      "Review the price waterfall and four commercial segments.",
      "Confirm workforce reconciliation (variance vs source of truth ≤ $1).",
      "Approve before exporting / submitting.",
    ],
    cpqUses: [
      "Consolidates labour, sundry, OSC and PH costs into final price.",
      "Applies margin-based Admin & Profit formula across the build.",
    ],
    estimatorNote: "Submitted projects become read-only — autosaves and system updates are bypassed.",
    workflow: "All pricing modules → Executive Summary → Tender Submission",
  },
  "labour-deployment-graphs": {
    helpKey: "labour-deployment-graphs",
    title: "How Labour Deployment Graphs work",
    purpose: "Visualise typical-week labour coverage across each day in 15-minute intervals.",
    userAction: [
      "Switch between days to see operator presence and break coverage.",
      "Use full screen mode for review with stakeholders.",
    ],
    cpqUses: [
      "Reads directly from Weekly Roster (read-only view).",
      "Counts staff present during breaks for coverage analysis.",
    ],
    workflow: "Weekly Roster → Labour Deployment Graphs",
  },
  "labour-assessment": {
    helpKey: "labour-assessment",
    title: "How Labour Assessment works",
    purpose: "Generate a preliminary staffing model and draft roster from building information.",
    userAction: [
      "Start at the Start Here tab and enter GFA, building levels and commercial standard.",
      "Refine benchmark percentages as supplied or measured data becomes available.",
      "Review Supervision (Discretionary Staff), Tenant Special Services and Weekend / Detailer Programs to ensure all site-specific staffing requirements have been included.",
      "Open the Suggested Roster tab and generate LA-managed operators.",
    ],
    cpqUses: [
      "Calculates hours per tab using production rates and area benchmarks.",
      "Converts hours into operators that flow into Operators' Details, Weekly Roster and pricing outputs.",
    ],
    estimatorNote: "Values are desktop benchmarks until refined with supplied or measured data.",
    workflow: "Labour Assessment → Operators' Details → Weekly Roster → Pricing",
  },

  // Labour Assessment sub-tabs
  "la-start-here": {
    helpKey: "la-start-here",
    title: "How Start Here works",
    purpose: "Establish the base building data used by every Labour Assessment calculation.",
    userAction: [
      "Enter GFA, building levels and Commercial Building Standard.",
      "Set or accept benchmark percentages for cleanable area, exclusions, tenancy and common-area splits.",
      "Choose Area Data Source: Estimated, Supplied or Measured.",
    ],
    cpqUses: [
      "Derives tenancy, common and ablution areas from GFA percentages.",
      "Seeds default building elements and tasks across the other LA tabs.",
    ],
    estimatorNote: "Values are desktop benchmarks. Refine using supplied schedules, measured plans or site inspection data.",
    workflow: "Start Here → Tenancy / Common & Public / W'end / Detailer → Suggested Roster",
  },
  "la-tenancy-areas": {
    helpKey: "la-tenancy-areas",
    title: "How Tenancy Areas works",
    purpose: "Calculate regular tenancy cleaning hours based on tenancy area, floor split, production rates and included tasks.",
    userAction: [
      "Include or exclude standard tenancy tasks.",
      "Add tenant-specific extras via Tenant Special Service groups.",
      "Adjust production rates or quantities where needed.",
    ],
    cpqUses: [
      "Multiplies area × production rate to derive hours per task.",
      "Hours feed into Suggested Roster night-clean shifts.",
    ],
    workflow: "Start Here → Tenancy Areas → Suggested Roster",
  },
  "la-common-public": {
    helpKey: "la-common-public",
    title: "How Common & Public Areas works",
    purpose: "Calculate shared/common area cleaning hours such as lobbies, corridors, ablutions, other amenities, stairs and circulation.",
    userAction: [
      "Confirm derived area splits (ablutions 2.5%, other amenities 1.5%, etc.).",
      "Include/exclude tasks and adjust production rates if required.",
    ],
    cpqUses: [
      "Only ablution-related areas are used for Toilet Cleaning Allowance qualification.",
      "Hours feed into Suggested Roster.",
    ],
    estimatorNote: "Toilet Cleaning Allowance applies when ≥50% of an operator's shift is toilet-cleaning duties.",
    workflow: "Start Here → Common & Public Areas → Suggested Roster",
  },
  "la-wend-detailer": {
    helpKey: "la-wend-detailer",
    title: "How W'end / Detailer works",
    purpose: "Capture weekend, periodic, detail or touch-up cleaning that is not part of the standard daily night clean.",
    userAction: [
      "Switch between mode options (programs vs fixed hours).",
      "Enter program-level hours and frequency, or a flat weekly allowance.",
    ],
    cpqUses: [
      "Adds dedicated weekend/detailer shifts in the Suggested Roster.",
      "May create additional rostered operators above the night-clean baseline.",
    ],
    workflow: "Start Here → W'end / Detailer → Suggested Roster",
  },
  "la-suggested-roster": {
    helpKey: "la-suggested-roster",
    title: "How Suggested Roster works",
    purpose: "Convert Labour Assessment hours into planned operators and managed roster entries.",
    userAction: [
      "Pick an optimisation mode and target shift length.",
      "Generate LA-managed operators and review the resulting plan.",
      "Use Freeze Roster to convert LA-managed operators into manual operators when ready.",
    ],
    cpqUses: [
      "LA Managed operators auto-update from Labour Assessment.",
      "Manual operators are never overwritten by LA regeneration.",
      "Generated operators flow into Operators' Details, Weekly Roster and pricing outputs.",
    ],
    estimatorNote: "Toilet Cleaning Allowance is auto-ticked on operators whose shift is ≥50% toilet duties.",
    workflow: "Labour Assessment → Suggested Roster → Operators' Details → Weekly Roster → Pricing",
  },
};
