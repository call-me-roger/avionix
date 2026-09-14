import React from 'react';
import {
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
  type ViewProps,
} from 'react-native';

import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  section: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  title: {
    color: theme.colors.text,
    fontWeight: 'bold' as const,
    fontSize: theme.typography.titleSize,
    marginBottom: theme.spacing.xs,
  },
  body: { color: theme.colors.text, fontSize: theme.typography.bodySize },
  muted: { color: theme.colors.textMuted },
  danger: { color: theme.colors.danger },
  success: { color: theme.colors.success },
  input: {
    color: theme.colors.text,
    backgroundColor: theme.colors.inputBackground,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    fontSize: theme.typography.bodySize,
  },
});

export function Section({ style, ...rest }: ViewProps) {
  const styles = useThemedStyles(makeStyles);
  return <View style={[styles.section, style]} {...rest} />;
}

export function SectionTitle({ style, ...rest }: TextProps) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={[styles.title, style]} {...rest} />;
}

export interface BodyTextProps extends TextProps {
  muted?: boolean;
  tone?: 'danger' | 'success';
}

export function BodyText({ muted = false, tone, style, ...rest }: BodyTextProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Text
      style={[
        styles.body,
        muted ? styles.muted : null,
        tone === 'danger' ? styles.danger : null,
        tone === 'success' ? styles.success : null,
        style,
      ]}
      {...rest}
    />
  );
}

export function ThemedTextInput({ style, ...rest }: TextInputProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TextInput
      placeholderTextColor={theme.colors.placeholder}
      keyboardAppearance={theme.mode}
      style={[styles.input, style]}
      {...rest}
    />
  );
}
