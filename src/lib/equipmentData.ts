// ── Equipment Library seed data (from Equip database.xlsx) ─────────────────

export interface EquipmentLibraryItem {
  id: string;
  type: 'major' | 'minor';
  category: string;
  item_name: string;
  default_unit_cost_ex_gst: number;
  default_life_years: number;
  default_interest_rate: number; // decimal e.g. 0.07 for 7%
  active: boolean;
}

// Major equipment categories (matching image layout)
export const MAJOR_CATEGORIES = [
  'Vacuums',
  'Specialty Machines',
  'Carpet Extractors',
  'Floor Machines and Burnishers',
  'Sweepers',
  'Walk Behind Scrubbers',
  'Ride on Scrubbers',
  'Robotic Solution Ride-On Scrubber',
  'Stand on Scrubbers',
  'Integrated Scrubber-Sweeper',
  'IPC Scrubbers',
  'Rotation System',
  'Cars and carts',
];

let _nextId = 1;
const mkId = () => `seed-${_nextId++}`;

const major = (category: string, item_name: string, cost: number): EquipmentLibraryItem => ({
  id: mkId(), type: 'major', category, item_name,
  default_unit_cost_ex_gst: cost, default_life_years: 5, default_interest_rate: 0, active: true,
});

const minor = (category: string, item_name: string, cost: number): EquipmentLibraryItem => ({
  id: mkId(), type: 'minor', category, item_name,
  default_unit_cost_ex_gst: cost, default_life_years: 3, default_interest_rate: 0, active: true,
});

export const SEED_EQUIPMENT_LIBRARY: EquipmentLibraryItem[] = [
  // ── Major ──
  major('Vacuums', 'Pacvac Backpack Vacuum Superpro700', 294.90),
  major('Vacuums', 'Pacvac Battery Vacuum Superpro 700 Advanced', 959.00),
  major('Vacuums', 'Columbus Upright Vacuum Cleaner BS361', 869.25),
  major('Vacuums', 'Truvox Wide Area Vacuum Valet 70cm', 4870.13),
  major('Vacuums', 'Cleanstar Commercial Wet & Dry Vacuum 30L', 457.88),

  major('Specialty Machines', 'SV8D Steamer With Vacuum', 3750.00),
  major('Specialty Machines', 'I-Remove Gum Removal Machine Kit', 7775.75),

  major('Carpet Extractors', 'Santoemma Carpet Extractor Elite Silent', 7108.63),

  major('Floor Machines and Burnishers', 'Polivac Two Speed Suction Polisher PV25TS', 3325.40),
  major('Floor Machines and Burnishers', 'Polivac Stingray UHS Electric Burnisher SL2000', 2716.60),
  major('Floor Machines and Burnishers', 'Polivac Gas Burnisher Gazda32 82cm', 12572.00),
  major('Floor Machines and Burnishers', 'Orbot Sprayborg Orbital Floor Machine Kit', 8480.85),
  major('Floor Machines and Burnishers', 'Polivac Predator MK1 Carpet Extractor Bundle', 6999.30),

  major('Sweepers', 'IPC/Tennant 510M Manual Push Sweeper 670mm', 1155.00),
  major('Sweepers', 'Tennant S10 Walk-Behind Sweeper 860mm', 16600.00),
  major('Sweepers', 'Tennant S20 Ride-On Sweeper Battery', 94720.00),
  major('Sweepers', 'Tennant S20 Ride-On Sweeper Diesel', 75340.00),
  major('Sweepers', 'Stolzenberg STR1150E Battery Ride On Sweeper', 24893.40),
  major('Sweepers', 'Tennant S10 Walk-Behind Sweeper Battery', 16550.00),

  major('Walk Behind Scrubbers', 'Columbus Floor Scrubber RA43B20 Kit', 3675.04),
  major('Walk Behind Scrubbers', 'Columbus Floor Scrubber RA55B40 Kit', 5567.15),
  major('Walk Behind Scrubbers', 'Columbus Industrial Scrubber RA66BM60IND Kit', 7127.60),
  major('Walk Behind Scrubbers', 'Columbus Floor Scrubber RA85BM90 Kit', 6692.94),
  major('Walk Behind Scrubbers', 'Truvox Multiwash PRO 340 Scrubber', 12253.46),
  major('Walk Behind Scrubbers', 'I-Scrub 30 Pro Orbital Scrubber', 12699.08),
  major('Walk Behind Scrubbers', 'I-Mop Floor Scrubber XL Basic Kit', 13862.77),
  major('Walk Behind Scrubbers', 'Columbus Floor Scrubber ARA66BM70 Kit', 13030.53),
  major('Walk Behind Scrubbers', 'Columbus Floor Scrubber ARA85BM120 Kit', 7493.25),
  major('Walk Behind Scrubbers', 'Columbus Scrubber ARA100BM200 Kit', 13132.50),
  major('Walk Behind Scrubbers', 'Tennant CS16', 15887.75),
  major('Walk Behind Scrubbers', 'Tennant T2', 15890.84),
  major('Walk Behind Scrubbers', 'Tennant T5', 17008.39),

  major('Ride on Scrubbers', 'Tennant T560 Micro Ride-On', 11264.00),
  major('Ride on Scrubbers', 'Tennant T581 Micro Ride-On', 15130.00),
  major('Ride on Scrubbers', 'Tennant T7 Ride-On Scrubber', 27750.00),
  major('Ride on Scrubbers', 'Tennant T16 Ride-On Scrubber Battery', 37300.00),

  major('Robotic Solution Ride-On Scrubber', 'T7 AMR Ride-On Disk Scrubber', 113000.00),

  major('Integrated Scrubber-Sweeper', 'M20 LPG Integrated Scrubber-Sweeper', 155000.00),

  major('Cars and carts', 'Striker Gladiator 48V UWB (High Ground Clearance)', 26510.00),
  major('Cars and carts', 'HotWash Pressure Cleaner MV-1211', 7424.00),

  // ── Minor ──
  minor('Minor Equipment', 'Rubberised Trolley', 1000.00),
  minor('Minor Equipment', 'Ostes Trolley', 50.00),
  minor('Minor Equipment', 'Motorola Radios', 50.00),
  minor('Minor Equipment', 'Mobile Phones', 500.00),
  minor('Minor Equipment', 'HP Computer & Printer', 1500.00),
  minor('Minor Equipment', 'Apple Tablet', 50.00),
  minor('Minor Equipment', 'Apple Phone', 50.00),
  minor('Minor Equipment', 'HotWash Pressure Cleaner', 2500.00),
  minor('Minor Equipment', 'Escalator Break Safe', 500.00),
  minor('Minor Equipment', 'General Vacuum Sweeper', 4000.00),
  minor('Minor Equipment', 'Maintenance Tools', 1000.00),
  minor('Minor Equipment', 'Front Washer/Dryer', 2500.00),

  minor('Car Expenses', 'Electricity', 500.00),
  minor('Car Expenses', 'Rent', 1400.00),
  minor('Car Expenses', 'Insurance', 50.00),
  minor('Car Expenses', 'Tyres', 1200.00),
  minor('Car Expenses', 'Service', 50.00),

  minor('Start Up Costs', 'Office Supplies', 1000.00),
  minor('Start Up Costs', 'Admin Table/Chairs', 1000.00),
  minor('Start Up Costs', 'Boardroom Table/Chairs', 2000.00),
  minor('Start Up Costs', 'Lunch Room Table/Chairs', 2500.00),
  minor('Start Up Costs', 'Induction Table/Chairs', 500.00),
  minor('Start Up Costs', 'Louvre Room Table/Chairs', 500.00),
  minor('Start Up Costs', 'Meeting Room Table/Chairs', 1000.00),
  minor('Start Up Costs', 'Computer & Printer', 1000.00),
  minor('Start Up Costs', 'Samsung Television', 1000.00),
  minor('Start Up Costs', 'Washing Machine/Dryer', 2000.00),
  minor('Start Up Costs', 'Fridge/Microwave', 2000.00),
  minor('Start Up Costs', 'Lockers/Radio', 500.00),
  minor('Start Up Costs', 'Posting Supplies/Signage', 1000.00),
];

// ── PMT calculation ──

/**
 * PMT: periodic payment for an annuity
 * If rate > 0: PMT = (r * PV) / (1 - (1+r)^(-n))
 * If rate = 0: PMT = PV / n
 */
export function calcAnnualCost(purchaseCost: number, lifeYears: number, interestRate: number): number {
  if (purchaseCost <= 0 || lifeYears <= 0) return 0;
  if (interestRate > 0) {
    const r = interestRate;
    const n = lifeYears;
    return (r * purchaseCost) / (1 - Math.pow(1 + r, -n));
  }
  return purchaseCost / lifeYears;
}
