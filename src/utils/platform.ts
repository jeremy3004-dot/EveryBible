import { Platform, Dimensions } from 'react-native';

export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';
export const isWeb = Platform.OS === 'web';

const { width, height } = Dimensions.get('window');
export const screenWidth = width;
export const screenHeight = height;

export const isSmallScreen = width < 375;
export const isLargeScreen = width >= 428;
export const isTablet = Math.min(width, height) >= 600;

// Check for iPhone with notch (iPhone X and later)
export const hasNotch = isIOS && !isTablet && (height >= 812 || width >= 812);

// Platform-specific values
export const platformSelect = <T>(values: { ios?: T; android?: T; default: T }): T => {
  if (isIOS && values.ios !== undefined) return values.ios;
  if (isAndroid && values.android !== undefined) return values.android;
  return values.default;
};

// Version check helpers
export const iosVersion = isIOS ? parseInt(Platform.Version as string, 10) : 0;
export const androidVersion = isAndroid ? (Platform.Version as number) : 0;

// Check if running on iOS 26+ (for future Liquid Glass support)
export const supportsLiquidGlass = isIOS && iosVersion >= 26;
