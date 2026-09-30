import type { Theme } from '@/theme/tokens';

/**
 * The label/value row shape `FlightValue` and `DestinationBlock` share (itself a copy of
 * `Readout`'s `makeStyles`, per the brief — not imported, since those styles are private to it).
 */
export const makeRowStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing.sm,
  },
  value: {
    color: theme.colors.text,
    fontSize: theme.typography.titleSize,
    fontWeight: 'bold' as const,
    fontVariant: ['tabular-nums' as const],
  },
  stale: { color: theme.colors.textMuted },
});
