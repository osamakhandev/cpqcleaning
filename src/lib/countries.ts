export type Country = {
  code: string;
  name: string;
  requiresPostcode: boolean;
};

// Common countries; postcode required where Stripe Tax / shipping typically demand it.
export const COUNTRIES: Country[] = [
  { code: "AU", name: "Australia", requiresPostcode: true },
  { code: "NZ", name: "New Zealand", requiresPostcode: true },
  { code: "US", name: "United States", requiresPostcode: true },
  { code: "CA", name: "Canada", requiresPostcode: true },
  { code: "GB", name: "United Kingdom", requiresPostcode: true },
  { code: "IE", name: "Ireland", requiresPostcode: false },
  { code: "DE", name: "Germany", requiresPostcode: true },
  { code: "FR", name: "France", requiresPostcode: true },
  { code: "ES", name: "Spain", requiresPostcode: true },
  { code: "IT", name: "Italy", requiresPostcode: true },
  { code: "NL", name: "Netherlands", requiresPostcode: true },
  { code: "BE", name: "Belgium", requiresPostcode: true },
  { code: "SE", name: "Sweden", requiresPostcode: true },
  { code: "NO", name: "Norway", requiresPostcode: true },
  { code: "DK", name: "Denmark", requiresPostcode: true },
  { code: "FI", name: "Finland", requiresPostcode: true },
  { code: "CH", name: "Switzerland", requiresPostcode: true },
  { code: "AT", name: "Austria", requiresPostcode: true },
  { code: "JP", name: "Japan", requiresPostcode: true },
  { code: "SG", name: "Singapore", requiresPostcode: true },
  { code: "HK", name: "Hong Kong", requiresPostcode: false },
  { code: "AE", name: "United Arab Emirates", requiresPostcode: false },
  { code: "IN", name: "India", requiresPostcode: true },
];

export function findCountry(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code.toUpperCase());
}
