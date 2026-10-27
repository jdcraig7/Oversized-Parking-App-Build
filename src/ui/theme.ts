import type { FitStatus } from '../lib/height';

export const colors = {
  bg: '#F4F6F8',
  card: '#FFFFFF',
  text: '#111827',
  muted: '#6B7280',
  border: '#E5E7EB',
  primary: '#1D4ED8',
  primaryText: '#FFFFFF',
  accent: '#F59E0B',
  danger: '#B91C1C',
  /** Sponsored placements: distinct from fit colors so an ad never looks like a verdict. */
  sponsor: '#7C3AED',
  sponsorBg: '#F5F3FF',
};

/** Colors for each fit status. Shapes/labels always accompany color for accessibility. */
export const fitColors: Record<FitStatus, { bg: string; fg: string; pin: string; icon: string; label: string }> = {
  fits: { bg: '#DCFCE7', fg: '#166534', pin: '#16A34A', icon: 'checkmark-circle', label: 'Fits' },
  tight: { bg: '#FEF3C7', fg: '#92400E', pin: '#D97706', icon: 'alert-circle', label: 'Tight' },
  unknown: { bg: '#E5E7EB', fg: '#374151', pin: '#6B7280', icon: 'help-circle', label: 'Unknown' },
  'too-low': { bg: '#FEE2E2', fg: '#991B1B', pin: '#DC2626', icon: 'close-circle', label: 'Too low' },
};

export const radius = 12;
export const space = (n: number) => n * 4;
