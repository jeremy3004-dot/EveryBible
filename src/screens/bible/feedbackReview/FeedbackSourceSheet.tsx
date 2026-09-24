import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import type { FeedbackCategoryFilter } from '../../../services/feedback';
import { ListRow, Sheet } from '../../../components/ui';
import { SOURCE_FILTERS } from './feedbackReviewScreenModel';

interface FeedbackSourceSheetProps {
  visible: boolean;
  category: FeedbackCategoryFilter;
  onChoose: (category: FeedbackCategoryFilter) => void;
  onClose: () => void;
}

/** Whose feedback to list: everyone, the Scripture Council, or the community. */
export function FeedbackSourceSheet({
  visible,
  category,
  onChoose,
  onClose,
}: FeedbackSourceSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Sheet visible={visible} onClose={onClose} title={t('feedback.sourceFilter')}>
      {SOURCE_FILTERS.map((filter, index) => (
        <ListRow
          key={filter.value}
          title={t(filter.labelKey)}
          trailing={
            category === filter.value ? (
              <Check size={18} color={colors.accentPrimary} strokeWidth={2.4} />
            ) : undefined
          }
          isLast={index === SOURCE_FILTERS.length - 1}
          onPress={() => onChoose(filter.value)}
        />
      ))}
    </Sheet>
  );
}
