import { useMemo } from 'react';
import { useAuthStore } from '../stores/authStore';
import { syncPreferences } from '../services/sync';

export type FontSizeKey = 'small' | 'medium' | 'large';

const fontScales: Record<FontSizeKey, number> = {
  small: 0.85,
  medium: 1,
  large: 1.2,
};

const fontSizeLabels: Record<FontSizeKey, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

const fontSizeOrder: FontSizeKey[] = ['small', 'medium', 'large'];

export function useFontSize() {
  const preferences = useAuthStore((state) => state.preferences);
  const setPreferences = useAuthStore((state) => state.setPreferences);

  const scale = useMemo(() => fontScales[preferences.fontSize], [preferences.fontSize]);

  const label = useMemo(() => fontSizeLabels[preferences.fontSize], [preferences.fontSize]);

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
