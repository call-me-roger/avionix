import React from 'react';
import { Text, View } from 'react-native';

import type { ConnectionState } from '@/domain/connection/connection-state';
import {
  type ConnectionStep,
  type StepState,
  connectionSteps,
  stepsLabel,
} from '@/domain/connection/connection-steps';
import { LINK_LABEL } from '@/features/health/LinkStatusBar';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const GLYPH: Record<StepState, string> = {
  done: '✓',
  current: '●',
  todo: '○',
};

const makeStyles = (theme: Theme) => ({
  row: { marginBottom: theme.spacing.md },
  steps: { flexDirection: 'row' as const, alignItems: 'flex-start' as const },
  step: { alignItems: 'center' as const },
  connector: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing.xs,
    marginTop: theme.typography.titleSize / 2,
  },
  glyphDone: { color: theme.colors.success, fontSize: theme.typography.titleSize },
  glyphCurrent: { color: theme.colors.primary, fontSize: theme.typography.titleSize },
  glyphTodo: { color: theme.colors.textMuted, fontSize: theme.typography.titleSize },
  labelDone: {
    color: theme.colors.success,
    fontSize: theme.typography.captionSize,
    marginTop: theme.spacing.xs,
  },
  labelCurrent: {
    color: theme.colors.primary,
    fontSize: theme.typography.captionSize,
    marginTop: theme.spacing.xs,
    fontWeight: 'bold' as const,
  },
  labelTodo: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.captionSize,
    marginTop: theme.spacing.xs,
  },
});

const GLYPH_STYLE_KEY: Record<StepState, 'glyphDone' | 'glyphCurrent' | 'glyphTodo'> = {
  done: 'glyphDone',
  current: 'glyphCurrent',
  todo: 'glyphTodo',
};

const LABEL_STYLE_KEY: Record<StepState, 'labelDone' | 'labelCurrent' | 'labelTodo'> = {
  done: 'labelDone',
  current: 'labelCurrent',
  todo: 'labelTodo',
};

/**
 * Find → Connect → Pair → Live (R-01 Setup): where the pilot is on the way to a connected, live
 * link. The glyph shape, not just its colour, carries the state, and the whole row is one
 * accessible element so a screen reader hears the current step instead of four disjoint labels.
 */
export function ConnectionSteps({
  state,
  live,
  hasHost,
}: {
  state: ConnectionState;
  live: boolean;
  hasHost: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const steps = connectionSteps(state, live, hasHost);
  const label = stepsLabel(steps, LINK_LABEL[state]);

  return (
    <View testID="connection-steps" accessible accessibilityLabel={label} style={styles.row}>
      {/*
       * The row's own accessibilityLabel already speaks the current step (stepsLabel); the glyphs
       * and per-step labels below are redundant for a screen reader and, being plain text, would
       * otherwise collide with on-screen button titles ("Connect", "Pair") in text queries. Hidden
       * from accessibility the same way PfdView and LightBar hide their own decorative text.
       */}
      <View
        style={styles.steps}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {steps.map((step: ConnectionStep, index) => (
          <React.Fragment key={step.key}>
            <View style={styles.step}>
              <Text style={styles[GLYPH_STYLE_KEY[step.state]]}>{GLYPH[step.state]}</Text>
              <Text style={styles[LABEL_STYLE_KEY[step.state]]}>{step.label}</Text>
            </View>
            {index < steps.length - 1 ? <View style={styles.connector} /> : null}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}
