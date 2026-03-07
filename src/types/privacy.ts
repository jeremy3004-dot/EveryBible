export type PrivacyAppIconMode = 'standard' | 'discreet';

export interface StoredPrivacySettings {
  mode: PrivacyAppIconMode;
  pin: string | null;
}
