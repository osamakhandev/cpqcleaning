import type { ServiceType, EmploymentType, OperatorLevel } from '@/types/roster';

export type RateBand = 'PH_FLAT' | 'SAT_FLAT' | 'SUN_FLAT' | 'WKDAY_DAY' | 'WKDAY_EMAFT' | 'WKDAY_PENALTY' | 'WKDAY_PERM_NIGHT';

export const RATE_BAND_LABELS: Record<RateBand, string> = {
  'PH_FLAT': 'Public Holiday',
  'SAT_FLAT': 'Saturday',
  'SUN_FLAT': 'Sunday',
  'WKDAY_DAY': 'Weekday Day',
  'WKDAY_EMAFT': 'Weekday EM/AFT',
  'WKDAY_PENALTY': 'Weekday Penalty',
  'WKDAY_PERM_NIGHT': 'Weekday Perm Night',
};

// Valid rate bands per service – used for validation
export const CLEANING_RATE_BANDS: RateBand[] = ['WKDAY_DAY', 'WKDAY_PENALTY', 'WKDAY_PERM_NIGHT', 'SAT_FLAT', 'SUN_FLAT', 'PH_FLAT'];
export const SECURITY_RATE_BANDS: RateBand[] = ['WKDAY_DAY', 'WKDAY_EMAFT', 'WKDAY_PERM_NIGHT', 'SAT_FLAT', 'SUN_FLAT', 'PH_FLAT'];

/** Validate that a rate band is valid for the given service */
export function validateRateBandForService(service: ServiceType, band: RateBand): boolean {
  const svc = service === 'customer-service' ? 'cleaning' : service;
  if (svc === 'cleaning' && band === 'WKDAY_EMAFT') return false;
  if (svc === 'security' && band === 'WKDAY_PENALTY') return false;
  return true;
}

export function assertRateBandForService(service: ServiceType, band: RateBand): void {
  if (!validateRateBandForService(service, band)) {
    throw new Error(`Invalid rate band for selected service: ${band} cannot be used with ${service}`);
  }
}

// Map our internal types to CSV values
const statusMap: Record<EmploymentType, string> = {
  'full-time': 'Full Time',
  'part-time': 'Part Time',
  'casual': 'Casual',
};

const classificationMap: Record<OperatorLevel, string> = {
  'level-1': 'Level 1',
  'level-2': 'Level 2',
  'level-3': 'Level 3',
  'level-4': 'Level 4',
  'level-5': 'Level 5',
};

const serviceMap: Record<ServiceType, string> = {
  'cleaning': 'Cleaning',
  'customer-service': 'Customer Service',
  'security': 'Security',
  'maintenance': 'Maintenance',
  'landscape': 'Landscape',
  'management': 'Management',
};

// Maps service to its version_id prefix for rate lookup
const SERVICE_VERSION_MAP: Record<string, string> = {
  'Cleaning': 'CLN_2025_JUL',
  'Customer Service': 'CLN_2025_JUL', // Customer Service uses Cleaning rates
  'Security': 'SEC_2025_JUL',
};

// Rate lookup key: version_id|service|employment_type|classification|rate_band
type RateKey = string;

let ratesCache: Map<RateKey, number> | null = null;

function buildRateKey(versionId: string, service: string, employmentType: string, classification: string, rateBand: string): RateKey {
  return `${versionId}|${service}|${employmentType}|${classification}|${rateBand}`;
}

function parseRatesCSV(csvContent: string): Map<RateKey, number> {
  const rates = new Map<RateKey, number>();
  const lines = csvContent.trim().split('\n');

  // Skip header: version_id,effective_from,service,award,employment_type,classification,classification_order,rate_band,rate_band_order,rate
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(',');
    if (parts.length < 10) continue;

    const versionId = parts[0];
    const service = parts[2];
    const employmentType = parts[4];
    const classification = parts[5];
    // classification_order (parts[6]) and rate_band_order (parts[8]) are sorting/display only
    const rateBand = parts[7];
    const rate = parseFloat(parts[9]);

    if (!isNaN(rate)) {
      const key = buildRateKey(versionId, service, employmentType, classification, rateBand);
      rates.set(key, rate);
    }
  }

  return rates;
}

// Combined Cleaning + Security wage database (validated format)
const CSV_DATA = `version_id,effective_from,service,award,employment_type,classification,classification_order,rate_band,rate_band_order,rate
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 1,1,WKDAY_DAY,1,33.91
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 1,1,WKDAY_DAY,1,27.13
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 1,1,WKDAY_DAY,1,27.13
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 1,1,WKDAY_EMAFT,2,39.8
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 1,1,WKDAY_EMAFT,2,33.02
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 1,1,WKDAY_EMAFT,2,33.02
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 1,1,WKDAY_PERM_NIGHT,3,42.05
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 1,1,WKDAY_PERM_NIGHT,3,35.27
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 1,1,WKDAY_PERM_NIGHT,3,35.27
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 1,1,SAT_FLAT,4,47.48
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 1,1,SAT_FLAT,4,40.7
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 1,1,SAT_FLAT,4,40.7
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 1,1,SUN_FLAT,5,61.04
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 1,1,SUN_FLAT,5,54.26
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 1,1,SUN_FLAT,5,54.26
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 1,1,PH_FLAT,6,74.61
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 1,1,PH_FLAT,6,67.83
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 1,1,PH_FLAT,6,67.83
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 2,2,WKDAY_DAY,1,34.89
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 2,2,WKDAY_DAY,1,27.91
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 2,2,WKDAY_DAY,1,27.91
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 2,2,WKDAY_EMAFT,2,40.94
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 2,2,WKDAY_EMAFT,2,33.97
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 2,2,WKDAY_EMAFT,2,33.97
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 2,2,WKDAY_PERM_NIGHT,3,43.26
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 2,2,WKDAY_PERM_NIGHT,3,36.28
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 2,2,WKDAY_PERM_NIGHT,3,36.28
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 2,2,SAT_FLAT,4,48.84
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 2,2,SAT_FLAT,4,41.87
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 2,2,SAT_FLAT,4,41.87
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 2,2,SUN_FLAT,5,62.8
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 2,2,SUN_FLAT,5,55.82
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 2,2,SUN_FLAT,5,55.82
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 2,2,PH_FLAT,6,76.75
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 2,2,PH_FLAT,6,69.78
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 2,2,PH_FLAT,6,69.78
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 3,3,WKDAY_DAY,1,35.48
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 3,3,WKDAY_DAY,1,28.38
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 3,3,WKDAY_DAY,1,28.38
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 3,3,WKDAY_EMAFT,2,41.63
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 3,3,WKDAY_EMAFT,2,34.54
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 3,3,WKDAY_EMAFT,2,34.54
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 3,3,WKDAY_PERM_NIGHT,3,43.99
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 3,3,WKDAY_PERM_NIGHT,3,36.89
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 3,3,WKDAY_PERM_NIGHT,3,36.89
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 3,3,SAT_FLAT,4,49.67
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 3,3,SAT_FLAT,4,42.57
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 3,3,SAT_FLAT,4,42.57
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 3,3,SUN_FLAT,5,63.86
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 3,3,SUN_FLAT,5,56.76
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 3,3,SUN_FLAT,5,56.76
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 3,3,PH_FLAT,6,78.05
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 3,3,PH_FLAT,6,70.95
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 3,3,PH_FLAT,6,70.95
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 4,4,WKDAY_DAY,1,36.08
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 4,4,WKDAY_DAY,1,28.86
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 4,4,WKDAY_DAY,1,28.86
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 4,4,WKDAY_EMAFT,2,42.34
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 4,4,WKDAY_EMAFT,2,35.12
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 4,4,WKDAY_EMAFT,2,35.12
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 4,4,WKDAY_PERM_NIGHT,3,44.73
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 4,4,WKDAY_PERM_NIGHT,3,37.52
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 4,4,WKDAY_PERM_NIGHT,3,37.52
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 4,4,SAT_FLAT,4,50.51
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 4,4,SAT_FLAT,4,43.29
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 4,4,SAT_FLAT,4,43.29
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 4,4,SUN_FLAT,5,64.94
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 4,4,SUN_FLAT,5,57.72
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 4,4,SUN_FLAT,5,57.72
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 4,4,PH_FLAT,6,79.37
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 4,4,PH_FLAT,6,72.15
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 4,4,PH_FLAT,6,72.15
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 5,5,WKDAY_DAY,1,37.24
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 5,5,WKDAY_DAY,1,29.79
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 5,5,WKDAY_DAY,1,29.79
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 5,5,WKDAY_EMAFT,2,43.7
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 5,5,WKDAY_EMAFT,2,36.25
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 5,5,WKDAY_EMAFT,2,36.25
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 5,5,WKDAY_PERM_NIGHT,3,44.73
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 5,5,WKDAY_PERM_NIGHT,3,38.73
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 5,5,WKDAY_PERM_NIGHT,3,38.73
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 5,5,SAT_FLAT,4,52.13
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 5,5,SAT_FLAT,4,44.69
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 5,5,SAT_FLAT,4,44.69
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 5,5,SUN_FLAT,5,67.03
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 5,5,SUN_FLAT,5,59.58
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 5,5,SUN_FLAT,5,59.58
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Casual,Level 5,5,PH_FLAT,6,81.92
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Full Time,Level 5,5,PH_FLAT,6,74.48
SEC_2025_JUL,2025-07-01,Security,Security Services Award,Part Time,Level 5,5,PH_FLAT,6,74.48
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 1,1,PH_FLAT,6,71.09
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 1,1,SAT_FLAT,4,45.24
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 1,1,SUN_FLAT,5,58.16
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 1,1,WKDAY_DAY,1,32.31
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 1,1,WKDAY_PENALTY,2,36.19
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 1,1,WKDAY_PERM_NIGHT,3,40.07
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 2,2,PH_FLAT,6,73.43
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 2,2,SAT_FLAT,4,46.73
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 2,2,SUN_FLAT,5,60.08
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 2,2,WKDAY_DAY,1,33.38
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 2,2,WKDAY_PENALTY,2,37.38
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 2,2,WKDAY_PERM_NIGHT,3,41.39
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 3,3,PH_FLAT,6,77.33
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 3,3,SAT_FLAT,4,49.21
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 3,3,SUN_FLAT,5,63.27
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 3,3,WKDAY_DAY,1,35.15
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 3,3,WKDAY_PENALTY,2,39.37
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Casual,Level 3,3,WKDAY_PERM_NIGHT,3,43.59
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 1,1,PH_FLAT,6,64.63
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 1,1,SAT_FLAT,4,38.78
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 1,1,SUN_FLAT,5,51.7
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 1,1,WKDAY_DAY,1,25.85
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 1,1,WKDAY_PENALTY,2,29.73
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 1,1,WKDAY_PERM_NIGHT,3,33.61
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 2,2,PH_FLAT,6,66.76
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 2,2,SAT_FLAT,4,40.05
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 2,2,SUN_FLAT,5,53.4
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 2,2,WKDAY_DAY,1,26.7
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 2,2,WKDAY_PENALTY,2,30.71
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 2,2,WKDAY_PERM_NIGHT,3,34.71
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 3,3,PH_FLAT,6,70.3
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 3,3,SAT_FLAT,4,42.18
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 3,3,SUN_FLAT,5,56.24
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 3,3,WKDAY_DAY,1,28.12
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 3,3,WKDAY_PENALTY,2,32.34
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Full Time,Level 3,3,WKDAY_PERM_NIGHT,3,36.56
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 1,1,PH_FLAT,6,68.5
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 1,1,SAT_FLAT,4,42.65
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 1,1,SUN_FLAT,5,55.58
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 1,1,WKDAY_DAY,1,29.73
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 1,1,WKDAY_PENALTY,2,33.61
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 1,1,WKDAY_PERM_NIGHT,3,33.61
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 2,2,PH_FLAT,6,70.76
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 2,2,SAT_FLAT,4,44.06
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 2,2,SUN_FLAT,5,57.41
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 2,2,WKDAY_DAY,1,30.71
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 2,2,WKDAY_PENALTY,2,34.71
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 2,2,WKDAY_PERM_NIGHT,3,34.71
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 3,3,PH_FLAT,6,74.52
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 3,3,SAT_FLAT,4,46.4
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 3,3,SUN_FLAT,5,60.46
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 3,3,WKDAY_DAY,1,32.34
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 3,3,WKDAY_PENALTY,2,36.56
CLN_2025_JUL,2025-07-01,Cleaning,Cleaning Services Award,Part Time,Level 3,3,WKDAY_PERM_NIGHT,3,36.56`;

function getRatesMap(): Map<RateKey, number> {
  if (!ratesCache) {
    ratesCache = parseRatesCSV(CSV_DATA);
  }
  return ratesCache;
}

/**
 * Resolve the version_id and CSV service name for a given ServiceType.
 * Customer Service maps to Cleaning rates (CLN_2025_JUL).
 */
function resolveVersionAndService(service: ServiceType): { versionId: string; csvService: string } | null {
  const csvService = serviceMap[service];
  // For Customer Service, look up using Cleaning rows in the CSV
  const lookupService = service === 'customer-service' ? 'Cleaning' : csvService;
  const versionId = SERVICE_VERSION_MAP[lookupService];
  if (!versionId) return null;
  return { versionId, csvService: lookupService };
}

export function lookupRate(
  service: ServiceType,
  employmentType: EmploymentType,
  level: OperatorLevel,
  rateBand: RateBand
): number | null {
  const resolved = resolveVersionAndService(service);
  if (!resolved) return null;

  const rates = getRatesMap();
  const key = buildRateKey(
    resolved.versionId,
    resolved.csvService,
    statusMap[employmentType],
    classificationMap[level],
    rateBand
  );
  return rates.get(key) ?? null;
}

export function getAllRatesForOperator(
  service: ServiceType,
  employmentType: EmploymentType,
  level: OperatorLevel
): Record<RateBand, number | null> {
  const svc = service === 'customer-service' ? 'cleaning' : service;
  const bands: RateBand[] = svc === 'cleaning' ? CLEANING_RATE_BANDS : svc === 'security' ? SECURITY_RATE_BANDS
    : ['PH_FLAT', 'SAT_FLAT', 'SUN_FLAT', 'WKDAY_DAY', 'WKDAY_EMAFT', 'WKDAY_PENALTY', 'WKDAY_PERM_NIGHT'];
  const result = {} as Record<RateBand, number | null>;

  for (const band of bands) {
    result[band] = lookupRate(service, employmentType, level, band);
  }

  return result;
}
