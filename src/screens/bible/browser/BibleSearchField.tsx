import type { RefObject } from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  type TextInput as TextInputType,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { radius, spacing, typography } from '../../../design/system';

const CLEAR_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

interface BibleSearchFieldProps {
  inputRef: RefObject<TextInputType | null>;
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
  onSubmit: () => void;
}

/** Search field for passage references and full-text queries, with a clear control. */
export function BibleSearchField({
  inputRef,
  value,
  onChangeText,
  onClear,
  onSubmit,
}: BibleSearchFieldProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.shell,
        { backgroundColor: colors.bibleSurface, borderColor: colors.controlBorder },
      ]}
    >
      <Ionicons name="search" size={18} color={colors.bibleSecondaryText} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        accessibilityLabel={t('common.search')}
        placeholder={t('common.search')}
        placeholderTextColor={colors.bibleSecondaryText}
        style={[styles.input, { color: colors.biblePrimaryText }]}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
      />
      {value.length > 0 ? (
        <TouchableOpacity
          style={styles.clearButton}
          onPress={onClear}
          hitSlop={CLEAR_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('settings.clear')}
        >
          <Ionicons name="close-circle" size={18} color={colors.bibleSecondaryText} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    paddingVertical: 0,
  },
  clearButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
