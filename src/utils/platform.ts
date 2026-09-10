import { Platform, Dimensions } from 'react-native';

export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';

const { width, height } = Dimensions.get('window');
export const screenWidth = width;
export const screenHeight = height;

export const isTablet = Math.min(width, height) >= 600;

// Version check helpers
export const iosVersion = isIOS ? parseInt(Platform.Version as string, 10) : 0;
