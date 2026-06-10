export const CONSUMABLE_CATEGORIES = [
  "Toilet Paper",
  "Toilet Paper Jumbo",
  "Hand Towel",
  "Bin Liners",
  "Urinal deodorants",
  "Soap",
  "Facial tissues",
  "Bins",
  "Nappy",
  "sanitary bin",
  "Others",
] as const;

export type ConsumableCategory = typeof CONSUMABLE_CATEGORIES[number];

export interface ConsumableItem {
  id: string;
  itemName: string;
  category: ConsumableCategory;
  unitCostExGst: number;
  uomPack: string;
  active: boolean;
}

export interface ConsumableRow {
  id: string;
  category: ConsumableCategory;
  libraryItemId: string | null;
  description: string;
  unitCost: number;
  unitsPA: number | null;
}

let nextId = 1;
function sid(): string { return `c-${nextId++}`; }

function item(name: string, cat: ConsumableCategory, cost: number, uom: string = ""): ConsumableItem {
  return { id: sid(), itemName: name, category: cat, unitCostExGst: cost, uomPack: uom, active: true };
}

export const SEED_CONSUMABLES: ConsumableItem[] = [
  // Toilet Paper
  item("Tork Toilet Tissue Advanced 2 Ply 400 Sheet", "Toilet Paper", 32.00, "Carton 48"),
  item("Puregiene® Toilet Tissue Superior 2 Ply 400 Sheet", "Toilet Paper", 31.74, "Carton 48"),
  item("Puregiene® Toilet Tissue Superior 2 Ply 700 Sheet", "Toilet Paper", 48.86, "Carton 48"),
  item("Puregiene® Jumbo Toilet Tissue Superior 2 Ply 300m", "Toilet Paper", 35.98, "Carton 8"),
  item("Puregiene Interleaved Toilet Tissue Superior 2 Ply 250 Sheet", "Toilet Paper", 29.80, "Carton 36"),
  item("Puregiene® Toilet Tissue Select 2 Ply 400 Sheet", "Toilet Paper", 23.00, "Carton 48"),
  item("Puregiene Toilet Tissue Select 2 Ply 250 Sheet", "Toilet Paper", 21.56, "Carton 48"),
  item("Puregiene Toilet Tissue Select 1 Ply 1000 Sheet", "Toilet Paper", 41.86, "Carton 48"),
  item("Puregiene Toilet Tissue Sovereign 2 Ply 400 Sheet", "Toilet Paper", 28.00, "Carton 48"),
  item("Puregiene Toilet Tissue Sovereign 3 Ply 225 Sheet", "Toilet Paper", 34.93, "Carton 48"),
  item("Enviroplus Toilet Tissue Bioactive 2 Ply 400 Sheet", "Toilet Paper", 37.50, "Carton 48"),
  item("Enviroplus Jumbo Toilet Tissue Bioactive 2 Ply 300m", "Toilet Paper", 29.99, "Carton 8"),
  item("Puregiene® Compaq Toilet Tissue Superior 2 Ply 1000 Sheet", "Toilet Paper", 48.51, "Carton 36"),
  item("Livi Everyday Toilet Tissue 2 Ply 400 Sheets", "Toilet Paper", 35.70, "Carton 48"),
  item("Enviroplus Toilet Tissue Eco 2 Ply 400 Sheet", "Toilet Paper", 26.24, "Carton 48"),
  item("Enviroplus Toilet Tissue Eco 2 Ply 700 Sheet", "Toilet Paper", 42.96, "Carton 48"),
  item("Enviroplus Slimline Interleaved Hand Towel Eco", "Toilet Paper", 37.12, "Carton 4000"),
  item("Enviroplus Roll Towel Eco 80m", "Toilet Paper", 56.90, "Carton 20"),
  item("Sorbent Professional Premium Toilet Tissue 2 Ply 300 Sheets", "Toilet Paper", 42.61, "Carton 48"),

  // Toilet Paper Jumbo
  item("Tork Jumbo Toilet Tissue Universal 1 Ply 600m", "Toilet Paper Jumbo", 52.59, "Carton 6"),
  item("Tork Mini Jumbo Toilet Tissue T2 Advanced 2 Ply 170m", "Toilet Paper Jumbo", 79.10, "Carton 12"),
  item("Puregiene Jumbo Toilet Tissue Virgin 2 Ply 300m", "Toilet Paper Jumbo", 22.00, "Carton 8"),
  item("Enviroplus Jumbo Toilet Tissue Eco 2 Ply 300m", "Toilet Paper Jumbo", 24.48, "Carton 8"),
  item("Puregiene® Jumbo Toilet Tissue Superior 1 Ply 500m", "Toilet Paper Jumbo", 24.92, "Carton 8"),

  // Hand Towel
  item("Tork Hand Towel Roll H1 Soft 2 Ply 150m", "Hand Towel", 82.91, "Carton 6"),
  item("Tork Hand Towel Xpress Multifold H2", "Hand Towel", 114.60, "Carton 3150"),
  item("Livi Centrefeed Towel Essentials 300m", "Hand Towel", 55.76, "Carton 4"),
  item("Puregiene® Slimline Interleaved Hand Towel Superior", "Hand Towel", 34.00, "Carton 4000"),
  item("Puregiene® Roll Towel Select 100m", "Hand Towel", 41.00, "Carton 16"),
  item("Puregiene® Slimline Interleaved Hand Towel Sovereign", "Hand Towel", 43.89, "Carton 3000"),
  item("Puregiene Ultraslim Interleaved Hand Towel Sovereign", "Hand Towel", 43.20, "Carton 2400"),
  item("Puregiene Compact Interleaved Hand Towel Sovereign", "Hand Towel", 34.02, "Carton 2160"),
  item("Puregiene Ultraslim Interleaved Hand Towel Superior", "Hand Towel", 26.50, "Carton 2400"),
  item("Puregiene Compact Interleaved Hand Towel Superior", "Hand Towel", 29.59, "Carton 2400"),
  item("Tork Xpress 148430 Advanced Slimline Multifold Towels 24x21cm", "Hand Towel", 42.70, "Carton 25 cases"),
  item("Tork Hand Towel Advanced Multifold", "Hand Towel", 42.80, "Carton 3000"),
  item("Puregiene Kitchen Roll Towel Superior 240 Sheet", "Hand Towel", 39.99, "Carton 12"),
  item("Puregiene Centrefeed Hand Towel 300m", "Hand Towel", 27.99, "Carton 4"),
  item("Livi Auto Cut Roll Towel Essentials 200m", "Hand Towel", 110.51, "Carton 6"),
  item("Jaws Mini Auto Cut Hand Towels 120m", "Hand Towel", 62.38, "Carton 6"),
  item("Puregiene Ultima Interleaved Hand Towel Sovereign", "Hand Towel", 61.90, "Carton 2400"),
  item("Enviroplus Ultraslim Interleaved Hand Towel Eco", "Hand Towel", 23.44, "Carton 2400"),
  item("Enviroplus Compact Interleaved Hand Towel Eco", "Hand Towel", 23.92, "Carton 2400"),
  item("Sorbent Professional TAD Ultraslim Hand Towel 1 Ply 150 Sheets", "Hand Towel", 54.03, "Carton 16"),
  item("Sorbent Professional TAD Multifold Hand Towel 1 Ply 150 Sheets", "Hand Towel", 52.90, "Carton 20"),
  item("Sorbent Professional TAD Compact Hand Towel 1 Ply 120 Sheets", "Hand Towel", 42.79, "Carton 20"),
  item("Sorbent Professional Performance Plus TAD Ultraslim Hand Towel 1 Ply 150 Sheets", "Hand Towel", 58.36, "Carton 16"),
  item("Sorbent Professional Performance Plus TAD Multifold Hand Towel 1 Ply 150 Sheets", "Hand Towel", 73.92, "Carton 20"),
  item("Sorbent Professional Performance Plus TAD Compact Hand Towel 1 Ply 120 Sheets", "Hand Towel", 52.95, "Carton 20"),
  item("Livi Everyday Multifold Hand Towel 1 Ply 200 Sheets", "Hand Towel", 49.35, "Carton 20"),

  // Bin Liners
  item("Classic® Bin Liners White 45L", "Bin Liners", 43.36, "Carton 500"),
  item("Classic® Bin Liners Black 72L", "Bin Liners", 21.00, "Carton 250"),
  item("Classic Bin Liners Heavy Duty Black 72L", "Bin Liners", 30.24, "Carton 250"),
  item("Classic® Heavy Duty Bin Liners Blue 72L", "Bin Liners", 39.07, "Carton 250"),
  item("Classic® Bin Liners Black 80L", "Bin Liners", 26.00, "Carton 250"),
  item("Classic® Heavy Duty Bin Liners Black 80L", "Bin Liners", 45.90, "Carton 250"),
  item("Classic® Bin Liners Extra Heavy Duty Black 80L", "Bin Liners", 38.80, "Carton 200"),
  item("Classic® Bin Liners Black 120L", "Bin Liners", 26.85, "Carton 250"),
  item("Classic® Heavy Duty Bin Liners Black 120L", "Bin Liners", 73.00, "Carton 250"),
  item("Classic® Bin Liners Black 150L", "Bin Liners", 22.32, "Carton 100"),
  item("Classic® Bin Liners Black 240L", "Bin Liners", 21.50, "Carton 100"),
  item("Classic® Heavy Duty Bin Liners Black 240L", "Bin Liners", 26.09, "Carton 100"),
  item("Classic® Bin Liners White Rolls 18L", "Bin Liners", 20.80, "Carton 1000"),
  item("Classic® Bin Liners White Rolls 27L", "Bin Liners", 22.73, "Carton 1000"),
  item("Classic® Bin Liners Black Rolls 27L", "Bin Liners", 28.16, "Carton 1000"),
  item("Classic® Bin Liners White Rolls 36L", "Bin Liners", 30.00, "Carton 1000"),
  item("Classic® Bin Liners Black Rolls 36L", "Bin Liners", 31.43, "Carton 1000"),
  item("Classic® Bin Liners Black Rolls 54L", "Bin Liners", 23.36, "Carton 250"),
  item("Classic® Bin Liners Black Rolls 72L", "Bin Liners", 30.44, "Carton 250"),
  item("Classic® Bin Liners Black Rolls 80L", "Bin Liners", 39.90, "Carton 250"),
  item("Classic Bin Liner Rolls Black 120L", "Bin Liners", 36.93, "Carton 250"),
  item("Classic® Bin Liners Black Rolls 240L", "Bin Liners", 35.44, "Carton 100"),
  item("Classic® Bin Liners Extra Heavy Duty Natural 240L Roll 100", "Bin Liners", 131.76, "Carton"),
  item("Classic® Bin Liners Heavy Duty Black Rolls 80L", "Bin Liners", 40.96, "Carton 250"),
  item("Classic® Bin Liners Natural 72L", "Bin Liners", 25.00, "Carton 250"),
  item("Classic Bin Liners Natural 240L", "Bin Liners", 62.56, "Carton 200"),
  item("Classic Bin Liners Heavy Duty Clear 140L", "Bin Liners", 92.08, "Carton 200"),
  item("Compost-A-Pak Bin Liners Green 80L - Carton 100 - 10 Rolls", "Bin Liners", 85.66, "Carton 100"),
  item("Compost-A-Pak Bin Liners Green 35L", "Bin Liners", 39.29, "Carton 100"),
  item("Enviroplus Bin Liners Compostable 80L", "Bin Liners", 52.00, "Carton 100"),
  item("Enviroplus Bin Liners Compostable 120L", "Bin Liners", 87.10, "Carton 100"),
  item("Enviroplus Bin Liners Compostable 240L", "Bin Liners", 122.10, "Carton 100"),
  item("Classic® Bin Liners White Rolls 55L", "Bin Liners", 77.84, "Carton 1000"),
  item("Classic® Heavy Duty Bin Liners Clear 72L", "Bin Liners", 43.25, "Carton 250"),
  item("Classic® Heavy Duty Bin Liner Clear 90L", "Bin Liners", 44.80, "Carton 200"),
  item("Classic® Heavy Duty Bin Liner Clear 120L", "Bin Liners", 50.50, "Carton 200"),
  item("Classic® Heavy Duty Bin Liner Clear 240L", "Bin Liners", 49.00, "Carton 100"),

  // Urinal deodorants
  item("Cleanmax Urinal Blocks Lemon 4kg", "Urinal deodorants", 59.40, "Each"),
  item("Puregiene® Urinal Screen Herbal Mint", "Urinal deodorants", 26.53, "Carton 12"),
  item("Puregiene® Urinal Screen Citrus", "Urinal deodorants", 26.53, "Carton 12"),
  item("Puregiene® Urinal Screen Mango", "Urinal deodorants", 26.53, "Carton 12"),
  item("Puregiene Urinal Screen Fresh Apple", "Urinal deodorants", 26.53, "Carton 12"),
  item("Puregiene Urinal Screen Strawberry", "Urinal deodorants", 26.53, "Carton 12"),
  item("Puregiene Urinal Screen Wonderland", "Urinal deodorants", 26.53, "Carton 12"),

  // Soap
  item("Spare Bottle & Rubber Tube Suits 110224", "Soap", 19.90, "Each"),
  item("Puregiene® Refillable Soap Dispenser Ecoline 900ml", "Soap", 15.00, "Each"),
  item("Tork Extra Mild Foam Soap S4 1L", "Soap", 308.90, "Carton 6"),
  item("Tork Mild Foam Soap S4 1L", "Soap", 110.95, "Carton 6"),
  item("Palmolive Liquid Handwash Pump Antibacterial 250ml", "Soap", 18.10, "Carton 6"),

  // Facial tissues
  item("Puregiene Facial Tissue Superior 200 Sheet", "Facial tissues", 36.95, "Carton 30"),
  item("Livi Facial Tissue Impressa 3 Ply 65 Sheet", "Facial tissues", 51.45, "Carton 24"),
  item("Livi Essentials Hypoallergenic Facial Tissues 2 Ply 100 Sheets", "Facial tissues", 55.65, "Carton 48"),

  // Bins
  item("Rubbermaid Slim Jim With Venting Channels Black 87L", "Bins", 428.20, "Carton 4"),
  item("Enviroplus Envirobin Mixed Recycling Yellow 60L", "Bins", 35.00, "Each"),
  item("Enviroplus Envirobin Organic Waste Green 60L", "Bins", 35.00, "Each"),
  item("Enviroplus Envirobin Landfill Waste Red 60L", "Bins", 35.00, "Each"),
  item("Enviroplus Envirobin Lid Organic Waste Green 60L", "Bins", 7.00, "Each"),
  item("Enviroplus Envirobin Lid Mixed Recycling Yellow 60L", "Bins", 7.00, "Each"),
  item("Enviroplus Envirobin Lid Landfill Waste Red 60L", "Bins", 7.00, "Each"),
  item("Bin Multisort Landfill 60L", "Bins", 115.10, "Each"),
  item("Round Plastic Waste Bin 80L Grey M6310", "Bins", 95.00, "Each"),
  item("Bin Multisort Organics 60L", "Bins", 115.10, "Each"),
  item("Bin Multisort Recycling 60L", "Bins", 115.10, "Each"),
  item("Wheely Bin Universal Spill Kit 240L", "Bins", 494.70, "Each"),

  // Nappy
  item("Classic Nappy Bin Liners Fragranced Degradable 60L", "Nappy", 115.12, "Carton 500"),
  item("Classic Nappy Bin Liners Degradeable 48L", "Nappy", 108.32, "Carton 500"),

  // sanitary bin
  item("Terracyclic Base Plinth White Suits 120023", "sanitary bin", 7.83, "Each"),
  item("Terracyclic Foot Pedal Suits 120023", "sanitary bin", 39.15, "Each"),
  item("Terracyclic Auto Sensor Suits 120023/120024", "sanitary bin", 77.04, "Each"),
  item("Terracyclic Foot Pedal Suits 120024", "sanitary bin", 30.60, "Each"),
  item("Terracyclic Base Plinth White Suits 120024", "sanitary bin", 10.86, "Each"),
  item("Terracyclic Sanitary Bin Base Black 26L", "sanitary bin", 31.86, "Each"),
  item("Terracyclic Refill Cartridge Biodegradable Black 13L", "sanitary bin", 7.74, "Each"),
  item("Terracyclic Base Plinth Black Suits 120387", "sanitary bin", 7.83, "Each"),
  item("Terracyclic Refill Cartridge Biodegradable Black 26L", "sanitary bin", 8.87, "Each"),
  item("Terracyclic Base Plinth Black Suits 120388", "sanitary bin", 10.86, "Each"),
  item("Terracyclic Sanitary Bin White 13L Kit (Includes Bin Base, Refill, Base Plinth & Sticker)", "sanitary bin", 61.84, ""),
  item("Terracyclic Sanitary Bin White 26L Kit (Includes Bin Base, Refill, Base Plinth & Sticker)", "sanitary bin", 68.93, ""),
];

const ROWS_PER_CATEGORY = 6;

export function createBlankRowsForCategory(category: ConsumableCategory): ConsumableRow[] {
  return Array.from({ length: ROWS_PER_CATEGORY }, (_, i) => ({
    id: `row-${category}-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category,
    libraryItemId: null,
    description: "",
    unitCost: 0,
    unitsPA: null,
  }));
}

export function createAllBlankRows(): ConsumableRow[] {
  return CONSUMABLE_CATEGORIES.flatMap(cat => createBlankRowsForCategory(cat));
}
