import React from 'react';
import { Pressable, View } from 'react-native';

import { type PanelLayout, canHidePanel } from '@/application/panel-layout';
import { type DeviceLayout, panelFit } from '@/domain/panels/device-layout';
import type { RegisteredPanel } from '@/features/panels/registry';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  row: {
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
  item: { marginBottom: theme.touch.spacing },
});

/** Which panels the switcher offers (F-04 scope: the pilot chooses which panels are present). */
export function PanelChooser({
  panels,
  panelIds,
  layout,
  deviceLayout,
  onSetHidden,
}: {
  panels: readonly RegisteredPanel[];
  panelIds: readonly string[];
  layout: PanelLayout;
  deviceLayout: DeviceLayout;
  onSetHidden: (id: string, hidden: boolean) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Section>
      <SectionTitle>Panels</SectionTitle>
      {panels.map(({ descriptor }) => {
        const hidden = layout.hidden.includes(descriptor.id);
        const lockedOn = !hidden && !canHidePanel(layout, panelIds, descriptor.id);
        const unsupported = panelFit(descriptor, deviceLayout) === 'unsupported';
        return (
          <View key={descriptor.id} style={styles.item}>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel={`Show ${descriptor.title} in the switcher`}
              accessibilityState={{ checked: !hidden, disabled: lockedOn }}
              disabled={lockedOn}
              onPress={() => onSetHidden(descriptor.id, !hidden)}
              style={styles.row}
            >
              <BodyText>{descriptor.title}</BodyText>
              <BodyText muted>{hidden ? 'Hidden' : 'Shown'}</BodyText>
            </Pressable>
            {unsupported ? (
              <BodyText muted>
                {deviceLayout.deviceClass === 'phone' ? 'Tablet only' : 'Phone only'}
              </BodyText>
            ) : null}
            {lockedOn ? <BodyText muted>At least one panel stays in the switcher.</BodyText> : null}
          </View>
        );
      })}
    </Section>
  );
}
