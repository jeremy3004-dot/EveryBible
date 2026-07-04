import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { darkColors, useTheme, type ThemeColors } from '../contexts/ThemeContext';
import { radius, spacing, typography } from '../design/system';

// Resolve theme colors defensively: if the ThemeProvider is itself part of the
// crash (missing/broken context), fall back to the dark palette so the fallback
// UI still renders instead of re-throwing (L24).
function useSafeThemeColors(): ThemeColors {
  try {
    return useTheme().colors;
  } catch {
    return darkColors;
  }
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  // ErrorBoundary is mounted inside ThemeProvider + I18nextProvider (see App.tsx),
  // but the provider itself may be part of the crash, so resolve colors defensively
  // (falls back to the dark palette) instead of re-throwing from the fallback UI.
  const colors = useSafeThemeColors();
  const { t } = useTranslation();
  const title = t('common.somethingWentWrong');
  const message = t('common.unexpectedError');
  const retryLabel = t('common.tryAgain');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
        </View>
        <Text style={[styles.title, { color: colors.primaryText }]}>{title}</Text>
        <Text style={[styles.message, { color: colors.secondaryText }]}>{message}</Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.accentPrimary }]}
          onPress={onRetry}
          activeOpacity={0.85}
        >
          <Ionicons name="refresh" size={20} color={colors.onAccent} />
          <Text style={[styles.retryText, { color: colors.onAccent }]}>{retryLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <ErrorFallback onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  content: {
    alignItems: 'center',
    maxWidth: 300,
  },
  iconContainer: {
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.sectionTitle,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  retryText: {
    ...typography.button,
  },
});
