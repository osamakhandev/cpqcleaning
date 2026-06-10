/**
 * Shared time normalization utility.
 * Converts raw numeric strings (e.g., "500", "1700") to "HH:MM" format.
 * Returns the original string if already formatted or invalid.
 */
export function normalizeTimeValue(raw: string): string {
  if (!raw) return raw;
  
  // Already formatted
  if (raw.includes(':')) {
    const parts = raw.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (!isNaN(hours) && !isNaN(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    return raw;
  }

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return raw;

  let hours: number;
  let minutes: number;

  if (digits.length === 1) {
    hours = parseInt(digits, 10);
    minutes = 0;
  } else if (digits.length === 2) {
    hours = parseInt(digits, 10);
    minutes = 0;
  } else if (digits.length === 3) {
    hours = parseInt(digits[0], 10);
    minutes = parseInt(digits.slice(1), 10);
  } else {
    hours = parseInt(digits.slice(0, 2), 10);
    minutes = parseInt(digits.slice(2, 4), 10);
  }

  if (!isNaN(hours) && !isNaN(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
  return raw;
}
