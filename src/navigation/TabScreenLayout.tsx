import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTabBarHeight } from '../hooks/useTabBarHeight';
import { getTabScreenBottomInset } from './tabScreenLayoutModel';

interface TabScreenLayoutProps {
  children: ReactElement;
  route: { name: string; params?: object };
  options: { presentation?: string };
}

function TabScreenLayout({ children, route, options }: TabScreenLayoutProps) {
  const { height } = useTabBarHeight();
  const bottomInset = getTabScreenBottomInset(
    route.name,
    route.params as Record<string, unknown> | undefined,
    options.presentation,
    height
  );

  // Margin reduces the actual screen bounds, including absolute-positioned
  // footers. Padding alone would still let those footers sit behind the tabs.
  return <View style={[styles.screen, { marginBottom: bottomInset }]}>{children}</View>;
}

export function renderTabScreenLayout(props: TabScreenLayoutProps) {
  return <TabScreenLayout {...props} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
