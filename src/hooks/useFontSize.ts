import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { syncPreferences } from '../services/sync';
import { FONT_SIZE_SCALES, type FontSizeKey } from '../constants/fontSizeScales';

export type { FontSizeKey };

const fontSizeOrder: FontSizeKey[] = ['small', 'medium', 'large'];

export function useFontSize() {
  const { t } = useTranslation();
  const preferences = useAuthStore((state) => state.preferences);
  const setPreferences = useAuthStore((state) => state.setPreferences);

  const scale = useMemo(() => FONT_SIZE_SCALES[preferences.fontSize], [preferences.fontSize]);

  const label = useMemo(() => {
    if (preferences.fontSize === 'small') return t('settings.fontSizeSmall');
    if (preferences.fontSize === 'large') return t('settings.fontSizeLarge');
    return t('settings.fontSizeMedium');
  }, [preferences.fontSize, t]);

  const scaleValue = (baseSize: number): number => {
    return Math.round(baseSize * scale);
  };

  const increase = () => {
    const currentIndex = fontSizeOrder.indexOf(preferences.fontSize);
    if (currentIndex < fontSizeOrder.length - 1) {
      setPreferences({ fontSize: fontSizeOrder[currentIndex + 1] });
      syncPreferences().catch(() => {});
    }
  };

  const decrease = () => {
    const currentIndex = fontSizeOrder.indexOf(preferences.fontSize);
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
    () => fontSizeOrder.indexOf(preferences.fontSize) < fontSizeOrder.length - 1,
    [preferences.fontSize]
  );

  const canDecrease = useMemo(
    () => fontSizeOrder.indexOf(preferences.fontSize) > 0,
    [preferences.fontSize]
  );

  return {
    fontSize: preferences.fontSize,
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
