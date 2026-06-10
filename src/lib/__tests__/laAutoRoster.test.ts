import { describe, it, expect } from "vitest";
import { buildLaPlan } from "@/lib/laAutoRoster";
import type { LAState } from "@/contexts/AssessmentContext";

const baseState = (): Partial<LAState> => ({
  buildingElements: [],
  elementTasks: [],
  tenantSpecialGroups: [],
  wendDetailerPrograms: [],
});

describe("buildLaPlan — core night cleaners", () => {
  it("returns an empty plan when there is no LA input", () => {
    expect(buildLaPlan(baseState() as LAState)).toEqual([]);
  });

  it("creates 4h Mon–Fri night cleaners proportional to core weekly hours", () => {
    const state = {
      ...baseState(),
      buildingElements: [
        { id: "e1", included: true, tabMapping: "tenancy-areas", group: "Cleaning", elementType: "Floor", elementName: "Floor", quantityValue: 1 },
      ],
      elementTasks: [
        { id: "t1", included: true, buildingElementId: "e1", taskName: "Vacuum", hoursAdjusted: 300 },
      ],
    } as unknown as LAState;
    const plan = buildLaPlan(state);
    const night = plan.filter(p => p.groupLabel === "Night Cleaner");
    expect(night).toHaveLength(15);
    expect(plan.filter(p => p.groupLabel === "Toilet Cleaning")).toHaveLength(0);
  });

  it("produces stable laKeys so re-running yields the same plan", () => {
    const state = {
      ...baseState(),
      buildingElements: [
        { id: "e1", included: true, tabMapping: "common-public", group: "Cleaning", elementType: "Lobby", elementName: "Lobby", quantityValue: 1 },
      ],
      elementTasks: [
        { id: "t1", included: true, buildingElementId: "e1", taskName: "Mop", hoursAdjusted: 40 },
      ],
    } as unknown as LAState;
    const a = buildLaPlan(state).map(p => p.laKey);
    const b = buildLaPlan(state).map(p => p.laKey);
    expect(a).toEqual(b);
  });
});

describe("buildLaPlan — toilet cleaning split", () => {
  const stateWith = (
    elements: Array<{ id: string; elementType: string; elementName?: string }>,
    tasks: Array<{ id: string; buildingElementId: string; taskName: string; hours: number; toiletAllowanceEligible?: boolean }>,
  ): LAState => ({
    ...baseState(),
    buildingElements: elements.map(e => ({
      id: e.id,
      included: true,
      tabMapping: "tenancy-areas",
      group: "Cleaning",
      elementType: e.elementType,
      elementName: e.elementName ?? e.elementType,
      quantityValue: 1,
    })) as never,
    elementTasks: tasks.map(t => ({
      id: t.id,
      included: true,
      buildingElementId: t.buildingElementId,
      taskName: t.taskName,
      hoursAdjusted: t.hours,
      toiletAllowanceEligible: t.toiletAllowanceEligible,
    })) as never,
  }) as LAState;

  it("reclassifies an operator as Toilet Cleaning when >=50% of their shift is toilet duties", () => {
    // 20h vacuum + 20h toilet = 40h total. Packs into 2 ops (5×4h = 20h each).
    // Concentrate-first puts all 20h toilet into op[0] -> 100% -> Toilet Cleaning.
    const state = stateWith(
      [
        { id: "e-floor", elementType: "Floor" },
        { id: "e-toilet", elementType: "Toilets" },
      ],
      [
        { id: "t1", buildingElementId: "e-floor", taskName: "Vacuum", hours: 20 },
        { id: "t2", buildingElementId: "e-toilet", taskName: "Toilets (per unit)", hours: 20 },
      ],
    );
    const plan = buildLaPlan(state);
    const toilet = plan.filter(p => p.groupLabel === "Toilet Cleaning");
    const night = plan.filter(p => p.groupLabel === "Night Cleaner");
    expect(toilet).toHaveLength(1);
    expect(toilet[0].seedToiletAllowance).toBe(true);
    expect(toilet[0].defaultTasks).toBe("Toilet Cleaning");
    expect(night).toHaveLength(1);
  });

  it("leaves operators as Night Cleaner when toilet duties are <50% of their shift (absorbed)", () => {
    // 40h vacuum + 8h toilet = 48h total. Op[0] = 20h shift, allocated 8h toilet = 40% -> stays Night.
    const state = stateWith(
      [
        { id: "e-floor", elementType: "Floor" },
        { id: "e-toilet", elementType: "Toilets" },
      ],
      [
        { id: "t1", buildingElementId: "e-floor", taskName: "Vacuum", hours: 40 },
        { id: "t2", buildingElementId: "e-toilet", taskName: "Toilets", hours: 8 },
      ],
    );
    const plan = buildLaPlan(state);
    expect(plan.filter(p => p.groupLabel === "Toilet Cleaning")).toHaveLength(0);
    expect(plan.filter(p => p.groupLabel === "Night Cleaner").length).toBeGreaterThan(0);
  });

  it("identifies toilet hours via task-name fallback when zone is not 'Toilets'", () => {
    // 16h wash room duties only -> packs into 1 op (4 days × 4h = 16h), 100% toilet.
    const state = stateWith(
      [{ id: "e1", elementType: "Amenities" }],
      [
        { id: "t1", buildingElementId: "e1", taskName: "Wash Room Deep Clean", hours: 16 },
      ],
    );
    const plan = buildLaPlan(state);
    expect(plan.filter(p => p.groupLabel === "Toilet Cleaning").length).toBeGreaterThan(0);
  });

  it("respects the explicit toiletAllowanceEligible=false flag (overrides fallback)", () => {
    const state = stateWith(
      [{ id: "e1", elementType: "Toilets" }],
      [
        { id: "t1", buildingElementId: "e1", taskName: "Toilets", hours: 20, toiletAllowanceEligible: false },
      ],
    );
    const plan = buildLaPlan(state);
    expect(plan.filter(p => p.groupLabel === "Toilet Cleaning")).toHaveLength(0);
    const night = plan.filter(p => p.groupLabel === "Night Cleaner");
    expect(night.length).toBeGreaterThan(0);
  });

  it("absorbs small toilet allocations into Night Clean without triggering the allowance", () => {
    // 2h toilet + 40h vacuum = 42h. Op[0] = 20h shift, 2h toilet = 10% -> Night.
    const state = stateWith(
      [{ id: "e1", elementType: "Toilets" }, { id: "e2", elementType: "Floor" }],
      [
        { id: "t1", buildingElementId: "e1", taskName: "Toilets", hours: 2 },
        { id: "t2", buildingElementId: "e2", taskName: "Vacuum", hours: 40 },
      ],
    );
    const plan = buildLaPlan(state);
    expect(plan.filter(p => p.groupLabel === "Toilet Cleaning")).toHaveLength(0);
  });

  it("explicit toiletAllowanceEligible=true qualifies a shift without keyword match", () => {
    // 16h sanitisation only -> 1 op × 16h, 100% toilet.
    const state = stateWith(
      [{ id: "e1", elementType: "Office" }],
      [
        { id: "t1", buildingElementId: "e1", taskName: "Sanitisation Round", hours: 16, toiletAllowanceEligible: true },
      ],
    );
    const plan = buildLaPlan(state);
    expect(plan.filter(p => p.groupLabel === "Toilet Cleaning").length).toBeGreaterThan(0);
  });
});

describe("buildLaPlan — user-defined staffing inputs", () => {
  it("uses discretionary quantity/start/hours and keeps 7.6h rows full-time", () => {
    const state = {
      ...baseState(),
      buildingElements: [
        { id: "disc-supervisor", included: true, tabMapping: "support-roles", group: "Supervision", elementName: "Supervisor", quantityValue: 1, frequencyPw: 5, hoursPerDay: 7.6, startTime: "06:00" },
        { id: "disc-day", included: true, tabMapping: "support-roles", group: "Supervision", elementName: "Day Cleaning / Replenishment", quantityValue: 2, frequencyPw: 5, hoursPerDay: 7.6, startTime: "06:00" },
      ],
    } as unknown as LAState;

    const plan = buildLaPlan(state);
    const disc = plan.filter(p => p.laKey.startsWith("disc:"));

    expect(disc).toHaveLength(3);
    expect(disc.filter(p => p.groupLabel === "Day Cleaning / Replenishment")).toHaveLength(2);
    expect(disc.every(p => p.seedEmploymentType === "full-time")).toBe(true);
    expect(disc.every(p => p.defaultStartTime === "06:00")).toBe(true);
    expect(disc.every(p => p.paidHoursPerDay === 7.6)).toBe(true);
  });

  it("includes dedicated tenant specials and a single Sat/Sun weekend operator from user hours", () => {
    const state = {
      ...baseState(),
      tenantSpecialGroups: [{ id: "tenant-1", tenantName: "Tenant", location: "L1", notes: "", included: true }],
      buildingElements: [
        { id: "tenant-el", included: true, tabMapping: "tenancy-specials", tenantGroupId: "tenant-1", group: "Tenancy Specials", elementType: "Office Rooms", elementName: "Office Rooms", quantityValue: 0 },
      ],
      elementTasks: [
        { id: "tenant-task", included: true, buildingElementId: "tenant-el", taskName: "Office Rooms", hoursAdjusted: 20 },
      ],
      wendDetailerPrograms: [
        { id: "weekend-1", name: "Weekend Program", included: true, satApplied: true, sunApplied: true, hoursPerDay: 8, hoursPerWeek: 16 },
      ],
    } as unknown as LAState;

    const plan = buildLaPlan(state);

    expect(plan.filter(p => p.groupLabel === "Tenant Special Services")).toHaveLength(1);
    const weekend = plan.filter(p => p.groupLabel === "Weekend Program");
    expect(weekend).toHaveLength(1);
    expect(weekend[0].workDays).toEqual(["sat", "sun"]);
    expect(weekend[0].seedEmploymentType).toBe("casual");
    expect(weekend[0].paidHoursPerDay).toBe(8);
  });
});
