import React from 'react';

import { useHapticsPreference } from '@/features/haptics/HapticsProvider';
import { RadioChips } from '@/theme/RadioChips';

type HapticsOption = 'on' | 'off';

const OPTIONS: { value: HapticsOption; label: string; accessibilityLabel: string }[] = [
  { value: 'on', label: 'On', accessibilityLabel: 'Haptic feedback On' },
  { value: 'off', label: 'Off', accessibilityLabel: 'Haptic feedback Off' },
];

export function HapticsToggle() {
  const { enabled, setEnabled } = useHapticsPreference();
  const selected: HapticsOption = enabled ? 'on' : 'off';
  const onSelect = (value: HapticsOption) => setEnabled(value === 'on');
  return <RadioChips options={OPTIONS} selected={selected} onSelect={onSelect} />;
}
