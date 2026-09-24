import { Modal, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts/ThemeContext';
import { useI18n } from '../../../hooks/useI18n';
import type { BibleTranslation } from '../../../types';
import { pickerStyles as styles } from './pickerStyles';
import { TranslationManageSheet } from './TranslationManageSheet';

/** The bottom sheet that hosts one Bible's manage sheet; hidden while no Bible is chosen. */
export function TranslationManageModal({
  translation,
  currentBook,
  isSelected,
  onClose,
  handleDownloadTextTranslation,
}: {
  translation: BibleTranslation | undefined;
  currentBook: string;
  isSelected: boolean;
  onClose: () => void;
  handleDownloadTextTranslation: (translation: BibleTranslation) => Promise<void>;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={translation != null}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
        // VoiceOver's escape gesture closes it, as Android back does.
        onAccessibilityEscape={onClose}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('interface.close')}
        />
        <View
          style={[
            styles.modalContent,
            {
              backgroundColor: colors.bibleSurface,
              borderColor: colors.bibleDivider,
              // The sheet is a bare Modal, so nothing else keeps its last
              // rows clear of the Android navigation bar.
              paddingBottom: insets.bottom,
            },
          ]}
        >
          {translation ? (
            <TranslationManageSheet
              translation={translation}
              currentBook={currentBook}
              isSelected={isSelected}
              onClose={onClose}
              handleDownloadTextTranslation={handleDownloadTextTranslation}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
