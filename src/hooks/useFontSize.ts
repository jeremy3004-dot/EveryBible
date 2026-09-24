import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { syncPreferences } from '../services/sync';
import { FONT_SIZE_SCALES, type FontSizeKey } from '../constants/fontSizeScales';

export type { FontSizeKey };

const fontSizeOrder: FontSizeKey[] = ['small', 'medium', 'large'];

export function useFontSize() {
  const { t } = useTranslation();
  // Only the size: the reader calls this hook, and subscribing to the whole
  // preferences object re-rendered it on every theme, language or reminder write.
  const fontSize = useAuthStore((state) => state.preferences.fontSize);
  const setPreferences = useAuthStore((state) => state.setPreferences);

  const scale = useMemo(() => FONT_SIZE_SCALES[fontSize], [fontSize]);

  const label = useMemo(() => {
    if (fontSize === 'small') return t('settings.fontSizeSmall');
    if (fontSize === 'large') return t('settings.fontSizeLarge');
    return t('settings.fontSizeMedium');
  }, [fontSize, t]);

  const scaleValue = (baseSize: number): number => {
    return Math.round(baseSize * scale);
  };

  const increase = () => {
    const currentIndex = fontSizeOrder.indexOf(fontSize);
    if (currentIndex < fontSizeOrder.length - 1) {
      setPreferences({ fontSize: fontSizeOrder[currentIndex + 1] });
      syncPreferences().catch(() => {});
    }
  };

  const decrease = () => {
    const currentIndex = fontSizeOrder.indexOf(fontSize);
    if (currentIndex > 0) {
      setPreferences({ fontSize: fontSizeOrder[currentIndex - 1] });
      syncPreferences().catch(() => {});
    }
  };

  const setSize = (size: FontSizeKey) => {
    setPreferences({ fontSize: size });
    syncPreferences().catch(() => {});
  };

  const canIncrease = useMemo(
    () => fontSizeOrder.indexOf(fontSize) < fontSizeOrder.length - 1,
    [fontSize]
  );

  const canDecrease = useMemo(() => fontSizeOrder.indexOf(fontSize) > 0, [fontSize]);

  return {
    fontSize,
    scale,
    label,
    scaleValue,
    increase,
    decrease,
    setSize,
    canIncrease,
    canDecrease,
  };
}
