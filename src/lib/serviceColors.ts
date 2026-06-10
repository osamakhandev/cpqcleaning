import { useState, useEffect, useCallback } from 'react';
import type { ServiceType, Operator } from '@/types/roster';

const STORAGE_KEY = 'cpq-service-colors';

export const DEFAULT_SERVICE_COLORS: Record<ServiceType, string> = {
  cleaning: '#2b9a9a',
  'customer-service': '#4a7abf',
  security: '#7c4dba',
  maintenance: '#d4880f',
  landscape: '#3da34d',
  management: '#c94040',
};

export function useServiceColors() {
  const [colors, setColors] = useState<Record<ServiceType, string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return { ...DEFAULT_SERVICE_COLORS, ...JSON.parse(stored) };
    } catch {}
    return { ...DEFAULT_SERVICE_COLORS };
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  }, [colors]);

  const setColor = useCallback((service: ServiceType, color: string) => {
    setColors(prev => ({ ...prev, [service]: color }));
  }, []);

  const resetColors = useCallback(() => {
    setColors({ ...DEFAULT_SERVICE_COLORS });
  }, []);

  return { colors, setColor, resetColors };
}

export function hasSupervisionAllowance(op: Operator): boolean {
  if (op.service === 'security' && op.securityAllowances?.supervisionBand && op.securityAllowances.supervisionBand !== 'none') return true;
  if (op.service === 'cleaning' && op.cleaningAllowances?.leadingHandBand && op.cleaningAllowances.leadingHandBand !== 'none') return true;
  return false;
}

export function levelNumber(level: string): string {
  return level.replace('level-', '');
}
