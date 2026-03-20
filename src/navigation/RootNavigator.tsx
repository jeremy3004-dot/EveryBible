import { useCallback, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { TabNavigator } from './TabNavigator';
import { useTheme } from '../contexts/ThemeContext';
import { flushQueuedAuthFlow, rootNavigationRef } from './rootNavigation';
import { useAudioStore } from '../stores/audioStore';

export function RootNavigator() {
  const { colors, isDark } = useTheme();
  const [currentRouteName, setCurrentRouteName] = useState<string | null>(null);
  const getCurrentRouteName = useCallback(() => rootNavigationRef.getCurrentRoute()?.name ?? null, []);
  const handleReady = useCallback(() => {
    flushQueuedAuthFlow();
    setCurrentRouteName(getCurrentRouteName());
  }, [getCurrentRouteName]);

  return (
    <NavigationContainer
      ref={rootNavigationRef}
      onReady={handleReady}
      onStateChange={() => setCurrentRouteName(getCurrentRouteName())}
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
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium: { fontFamily: 'System', fontWeight: '500' },
          bold: { fontFamily: 'System', fontWeight: '700' },
          heavy: { fontFamily: 'System', fontWeight: '800' },
        },
      }}
    >
      <TabNavigator />
      <MiniPlayerHost currentRouteName={currentRouteName} />
    </NavigationContainer>
  );
}

function MiniPlayerHost({ currentRouteName }: { currentRouteName: string | null }) {
  const hasPlayableSession = useAudioStore((state) =>
    Boolean(
      (state.currentBookId && state.currentChapter) ||
        (state.lastPlayedBookId && state.lastPlayedChapter)
    )
  );

  if (!hasPlayableSession) {
    return null;
  }

  const { MiniPlayer } = require('../components/audio/MiniPlayer') as typeof import('../components/audio/MiniPlayer');

  return <MiniPlayer currentRouteName={currentRouteName} />;
}
