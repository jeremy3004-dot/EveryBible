import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { layout, radius, spacing, typography } from '../../../design/system';
import { TranslationPickerHeader } from '../TranslationPickerHeader';

type TranslationPickerListComponent =
  typeof import('../TranslationPickerList').TranslationPickerList;

/**
 * The browser's translation bottom sheet. The shared picker (catalog and audio
 * helpers) is imported only the first time the sheet opens, keeping it out of
 * the browser's first render.
 */
export function TranslationPickerSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [TranslationPickerComponent, setTranslationPickerComponent] =
    useState<TranslationPickerListComponent | null>(null);

  useEffect(() => {
    if (!visible || TranslationPickerComponent) {
      return;
    }

    let isMounted = true;

    void import('../TranslationPickerList').then((module) => {
      if (isMounted) {
        setTranslationPickerComponent(() => module.TranslationPickerList);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [TranslationPickerComponent, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View
          style={[
            styles.content,
            { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
          ]}
        >
          <TranslationPickerHeader
            onClose={onClose}
            style={styles.header}
            titleStyle={styles.title}
          />
          {TranslationPickerComponent ? (
            <TranslationPickerComponent onRequestClose={onClose} />
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.bibleAccent} />
              <Text style={[styles.loadingText, { color: colors.bibleSecondaryText }]}>
                {t('common.loading')}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    paddingTop: layout.denseCardPadding,
    height: '60%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.cardTitle,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.label,
  },
});
