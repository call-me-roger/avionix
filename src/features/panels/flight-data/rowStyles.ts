import type { Theme } from '@/theme/tokens';
import { numeric } from '@/theme/typography';

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
  label: {
    fontSize: theme.typography.captionSize,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: theme.colors.textMuted,
  },
  value: {
    color: theme.colors.text,
    fontSize: theme.typography.titleSize,
    ...numeric(theme, true),
  },
  stale: { color: theme.colors.textMuted },
});
