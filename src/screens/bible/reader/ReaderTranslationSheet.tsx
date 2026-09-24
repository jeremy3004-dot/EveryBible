import { StyleSheet, Modal, TouchableOpacity, View } from 'react-native';
import { radius } from '../../../design/system';
import { TranslationPickerHeader } from '../TranslationPickerHeader';
import { useTheme } from '../../../contexts/ThemeContext';
import type { BibleTranslation } from '../../../types';
import { TranslationPickerList } from '../TranslationPickerList';

export interface ReaderTranslationSheetProps {
  canShowTranslationSheet: boolean;
  handleCloseTranslationSheet: () => void;
  handleTranslationActivated: (translation: BibleTranslation) => void;
  showTranslationSheet: boolean;
}

/** The shared translation picker in a fixed-height sheet. */
export function ReaderTranslationSheet({
  canShowTranslationSheet,
  handleCloseTranslationSheet,
  handleTranslationActivated,
  showTranslationSheet,
}: ReaderTranslationSheetProps) {
  const { colors } = useTheme();
  return canShowTranslationSheet ? (
    <Modal
      visible={showTranslationSheet}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="slide"
      onRequestClose={handleCloseTranslationSheet}
    >
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onPress={handleCloseTranslationSheet}
        />
        <View
          style={[
            styles.modalContent,
            { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
          ]}
        >
          <TranslationPickerHeader
            onClose={handleCloseTranslationSheet}
            style={styles.modalHeader}
            titleStyle={styles.modalTitle}
          />
          <TranslationPickerList
            onRequestClose={handleCloseTranslationSheet}
            onTranslationActivated={handleTranslationActivated}
          />
        </View>
      </View>
    </Modal>
  ) : null;
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    paddingTop: 20,
    height: '78%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
});
