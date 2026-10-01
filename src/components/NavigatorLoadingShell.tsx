import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

// What the app shows while the navigator module loads after onboarding finishes. The module is
// large, and in a development build Metro bundles it on demand, so without an indicator the reader
// stares at an empty screen for seconds right after choosing a Bible.
export function NavigatorLoadingShell() {
  const { colors } = useTheme();

  return (
    <View
      testID="navigator-loading-shell"
      style={[styles.shell, { backgroundColor: colors.background }]}
    >
      <ActivityIndicator color={colors.accentPrimary} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
