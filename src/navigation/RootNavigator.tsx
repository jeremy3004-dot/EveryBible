import { useCallback, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { TabNavigator } from './TabNavigator';
import { useTheme } from '../contexts/ThemeContext';
import { rootNavigationRef } from './rootNavigation';
import { useAudioStore } from '../stores/audioStore';
import { navigationTypography } from '../design/system';
import { linkingConfig } from './linkingConfig';

export function RootNavigator() {
  const { colors, isDark } = useTheme();
  const [currentRouteName, setCurrentRouteName] = useState<string | null>(null);
  const getCurrentRouteName = useCallback(() => {
    return rootNavigationRef.getCurrentRoute()?.name ?? null;
  }, []);
  const handleReady = useCallback(() => {
    setCurrentRouteName(getCurrentRouteName());
  }, [getCurrentRouteName]);

  return (
    <NavigationContainer
      ref={rootNavigationRef}
      linking={linkingConfig}
      onReady={handleReady}
      onStateChange={() => {
        setCurrentRouteName(getCurrentRouteName());
      }}
      theme={{
        dark: isDark,
        colors: {
          primary: colors.tabActive,
          background: colors.background,
          card: colors.cardBackground,
          text: colors.primaryText,
          border: colors.cardBorder,
          notification: colors.accentGreen,
        },
        fonts: navigationTypography,
      }}
    >
      <TabNavigator />
      <MiniPlayerHost currentRouteName={currentRouteName} />
    </NavigationContainer>
  );
}

function MiniPlayerHost({
  currentRouteName,
}: {
  currentRouteName: string | null;
}) {
  const hasActivePlaybackSession = useAudioStore((state) =>
    Boolean(state.currentBookId && state.currentChapter)
  );

  if (!hasActivePlaybackSession) {
    return null;
  }

  const { MiniPlayer } =
    require('../components/audio/MiniPlayer') as typeof import('../components/audio/MiniPlayer');

  return <MiniPlayer currentRouteName={currentRouteName} />;
}
