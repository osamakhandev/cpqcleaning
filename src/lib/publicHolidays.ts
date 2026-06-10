import type { AustralianState } from '@/hooks/usePricingData';

export interface PublicHoliday {
  id: string;
  name: string;
  date: string;
  notes?: string;
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function ds(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addD(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toDs(d: Date): string {
  return ds(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function dayOfWeek(d: Date): number {
  return d.getDay(); // 0=Sun, 6=Sat
}

function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  let d = new Date(year, month - 1, 1);
  let count = 0;
  for (let i = 0; i < 40; i++) {
    if (d.getDay() === weekday) {
      count++;
      if (count === n) return d;
    }
    d = addD(d, 1);
  }
  return d;
}

/**
 * Returns the next Monday after the given date.
 */
function nextMonday(d: Date): Date {
  const dow = dayOfWeek(d);
  const daysUntilMon = dow === 0 ? 1 : (8 - dow);
  return addD(d, daysUntilMon);
}

/**
 * For a fixed-date public holiday, if it falls on a weekend,
 * add the observed/substitute day (next available weekday).
 *
 * Special handling for Christmas/Boxing Day pair:
 *  - If Christmas is Saturday & Boxing Day is Sunday → Mon 27 & Tue 28
 *  - If Christmas is Sunday & Boxing Day is Monday → Mon 27 for Christmas (Boxing Day already Mon)
 *  - Otherwise standard: Sat→Mon, Sun→Mon
 *
 * For Anzac Day: substitution rules vary by state, handled separately.
 */
function addSubstituteDays(
  holidays: PublicHoliday[],
  year: number,
  state: AustralianState
): void {
  // --- Christmas / Boxing Day pair ---
  const xmasDate = new Date(year, 11, 25);
  const boxingDate = new Date(year, 11, 26);
  const xmasDow = dayOfWeek(xmasDate);

  if (xmasDow === 6) {
    // Christmas = Saturday, Boxing Day = Sunday
    // Observed: Mon 27 Dec (Christmas), Tue 28 Dec (Boxing Day)
    holidays.push({
      id: `xm-obs-${year}`,
      name: 'Christmas Day (substitute)',
      date: ds(year, 12, 27),
      notes: 'Substitute for Saturday',
    });
    holidays.push({
      id: `bd-obs-${year}`,
      name: 'Boxing Day (substitute)',
      date: ds(year, 12, 28),
      notes: 'Substitute for Sunday',
    });
  } else if (xmasDow === 0) {
    // Christmas = Sunday, Boxing Day = Monday (already a weekday)
    // Observed: Mon 27 Dec for Christmas
    holidays.push({
      id: `xm-obs-${year}`,
      name: 'Christmas Day (substitute)',
      date: ds(year, 12, 27),
      notes: 'Substitute for Sunday',
    });
  } else if (xmasDow === 5) {
    // Christmas = Friday, Boxing Day = Saturday
    // Observed: Mon 28 Dec for Boxing Day
    holidays.push({
      id: `bd-obs-${year}`,
      name: 'Boxing Day (substitute)',
      date: ds(year, 12, 28),
      notes: 'Substitute for Saturday',
    });
  }

  // --- New Year's Day ---
  const nyDate = new Date(year, 0, 1);
  const nyDow = dayOfWeek(nyDate);
  if (nyDow === 6) {
    holidays.push({
      id: `ny-obs-${year}`,
      name: "New Year's Day (substitute)",
      date: ds(year, 1, 3),
      notes: 'Substitute for Saturday',
    });
  } else if (nyDow === 0) {
    holidays.push({
      id: `ny-obs-${year}`,
      name: "New Year's Day (substitute)",
      date: ds(year, 1, 2),
      notes: 'Substitute for Sunday',
    });
  }

  // --- Australia Day ---
  const adDate = new Date(year, 0, 26);
  const adDow = dayOfWeek(adDate);
  if (adDow === 6) {
    holidays.push({
      id: `ad-obs-${year}`,
      name: 'Australia Day (substitute)',
      date: ds(year, 1, 28),
      notes: 'Substitute for Saturday',
    });
  } else if (adDow === 0) {
    holidays.push({
      id: `ad-obs-${year}`,
      name: 'Australia Day (substitute)',
      date: ds(year, 1, 27),
      notes: 'Substitute for Sunday',
    });
  }

  // --- Anzac Day ---
  // Most states: if Anzac Day falls on Sunday, observed Monday.
  // WA & NT: also substitute if Saturday.
  // QLD: additional Monday if Sunday.
  const azDate = new Date(year, 3, 25);
  const azDow = dayOfWeek(azDate);
  const anzacSubSat = ['WA', 'NT'].includes(state);

  if (azDow === 0) {
    holidays.push({
      id: `az-obs-${year}`,
      name: 'Anzac Day (substitute)',
      date: ds(year, 4, 26),
      notes: 'Substitute for Sunday',
    });
  } else if (azDow === 6 && anzacSubSat) {
    holidays.push({
      id: `az-obs-${year}`,
      name: 'Anzac Day (substitute)',
      date: toDs(nextMonday(azDate)),
      notes: 'Substitute for Saturday',
    });
  }

  // --- State-specific fixed-date holidays ---

  // SA: Proclamation Day (24 Dec)
  if (state === 'SA') {
    const pdDate = new Date(year, 11, 24);
    const pdDow = dayOfWeek(pdDate);
    if (pdDow === 6) {
      holidays.push({
        id: `pd-obs-${year}`,
        name: 'Proclamation Day (substitute)',
        date: toDs(nextMonday(pdDate)),
        notes: 'Substitute for Saturday',
      });
    } else if (pdDow === 0) {
      // If Christmas is Monday, Proclamation Day (Sun) substitute = Tue 26
      // but Boxing Day is already 26 Dec. Push to next available.
      const sub = nextMonday(pdDate);
      // Check if sub clashes with Christmas substitute days
      const subStr = toDs(sub);
      const taken = holidays.some(h => h.date === subStr);
      holidays.push({
        id: `pd-obs-${year}`,
        name: 'Proclamation Day (substitute)',
        date: taken ? toDs(addD(sub, 1)) : subStr,
        notes: 'Substitute for Sunday',
      });
    }
  }

  // ACT: Reconciliation Day (27 May)
  if (state === 'ACT') {
    const rcDate = new Date(year, 4, 27);
    const rcDow = dayOfWeek(rcDate);
    if (rcDow === 6) {
      holidays.push({
        id: `rc-obs-${year}`,
        name: 'Reconciliation Day (substitute)',
        date: toDs(nextMonday(rcDate)),
        notes: 'Substitute for Saturday',
      });
    } else if (rcDow === 0) {
      holidays.push({
        id: `rc-obs-${year}`,
        name: 'Reconciliation Day (substitute)',
        date: toDs(nextMonday(rcDate)),
        notes: 'Substitute for Sunday',
      });
    }
  }

  // WA: Western Australia Day (1 Jun)
  if (state === 'WA') {
    const waDate = new Date(year, 5, 1);
    const waDow = dayOfWeek(waDate);
    if (waDow === 6) {
      holidays.push({
        id: `wd-obs-${year}`,
        name: 'Western Australia Day (substitute)',
        date: toDs(nextMonday(waDate)),
        notes: 'Substitute for Saturday',
      });
    } else if (waDow === 0) {
      holidays.push({
        id: `wd-obs-${year}`,
        name: 'Western Australia Day (substitute)',
        date: toDs(nextMonday(waDate)),
        notes: 'Substitute for Sunday',
      });
    }
  }
}

export function getPublicHolidays(state: AustralianState, year: number): PublicHoliday[] {
  const easter = easterSunday(year);
  const h: PublicHoliday[] = [
    { id: `ny-${year}`, name: "New Year's Day", date: ds(year, 1, 1) },
    { id: `ad-${year}`, name: 'Australia Day', date: ds(year, 1, 26) },
    { id: `gf-${year}`, name: 'Good Friday', date: toDs(addD(easter, -2)) },
    { id: `es-${year}`, name: 'Easter Saturday', date: toDs(addD(easter, -1)) },
    { id: `em-${year}`, name: 'Easter Monday', date: toDs(addD(easter, 1)) },
    { id: `az-${year}`, name: 'Anzac Day', date: ds(year, 4, 25) },
    { id: `xm-${year}`, name: 'Christmas Day', date: ds(year, 12, 25) },
    { id: `bd-${year}`, name: 'Boxing Day', date: ds(year, 12, 26) },
  ];

  const qb = (d: Date, notes?: string) =>
    h.push({ id: `qb-${year}`, name: "Queen's Birthday", date: toDs(d), notes });

  switch (state) {
    case 'ACT':
      qb(nthWeekday(year, 6, 1, 2));
      h.push({ id: `cb-${year}`, name: 'Canberra Day', date: toDs(nthWeekday(year, 3, 1, 2)), notes: '2nd Mon March' });
      h.push({ id: `rc-${year}`, name: 'Reconciliation Day', date: ds(year, 5, 27) });
      break;
    case 'NSW':
      qb(nthWeekday(year, 6, 1, 2));
      h.push({ id: `bh-${year}`, name: 'Bank Holiday', date: toDs(nthWeekday(year, 8, 1, 1)), notes: 'Financial sector' });
      break;
    case 'VIC':
      qb(nthWeekday(year, 6, 1, 2));
      h.push({ id: `mc-${year}`, name: 'Melbourne Cup Day', date: toDs(nthWeekday(year, 11, 2, 1)), notes: 'Metro Melbourne' });
      break;
    case 'QLD':
      qb(nthWeekday(year, 10, 1, 4), 'QLD specific');
      h.push({ id: `rq-${year}`, name: 'Royal Queensland Show', date: toDs(nthWeekday(year, 8, 3, 2)), notes: 'Brisbane area' });
      break;
    case 'SA':
      qb(nthWeekday(year, 6, 1, 2));
      h.push({ id: `ac-${year}`, name: 'Adelaide Cup', date: toDs(nthWeekday(year, 3, 1, 2)), notes: '2nd Mon March' });
      h.push({ id: `pd-${year}`, name: 'Proclamation Day', date: ds(year, 12, 24) });
      break;
    case 'WA':
      qb(nthWeekday(year, 9, 1, 4), 'WA specific');
      h.push({ id: `wd-${year}`, name: 'Western Australia Day', date: ds(year, 6, 1) });
      break;
    case 'TAS':
      qb(nthWeekday(year, 6, 1, 2));
      h.push({ id: `rd-${year}`, name: 'Recreation Day', date: toDs(nthWeekday(year, 11, 1, 1)), notes: 'North TAS' });
      break;
    case 'NT':
      qb(nthWeekday(year, 6, 1, 2));
      h.push({ id: `md-${year}`, name: 'May Day', date: toDs(nthWeekday(year, 5, 1, 1)) });
      h.push({ id: `pk-${year}`, name: 'Picnic Day', date: toDs(nthWeekday(year, 8, 1, 1)) });
      break;
  }

  // Add substitute/observed days for weekend holidays
  addSubstituteDays(h, year, state);

  return h.sort((a, b) => a.date.localeCompare(b.date));
}

export function dateToDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

export function dateToDayOfWeek(dateStr: string): 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' {
  const d = new Date(dateStr + 'T00:00:00');
  return (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[d.getDay()];
}
