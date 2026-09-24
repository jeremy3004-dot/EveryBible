import { useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../../stores/authStore';
import { clearDeviceCaches } from '../../../stores/deviceCaches';
import { deleteAccountAndLocalData } from '../../../services/account';

/** Clear Cache and Delete Account: the two destructive actions under Data. */
export function useDataSettings() {
  const { t } = useTranslation();
  const isSignedIn = useAuthStore((state) => Boolean(state.user));
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleClearCache = () => {
    Alert.alert(t('settings.clearCache'), t('settings.clearCacheConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.clear'),
        style: 'destructive',
        onPress: () => {
          try {
            // Only re-downloadable caches: private notes of every account on
            // this phone, and downloads, are not a cache (deviceCaches.ts).
            clearDeviceCaches();
            Alert.alert(t('common.done'), t('settings.cacheClearedSuccess'));
          } catch {
            Alert.alert(t('common.error'), t('settings.cacheClearError'));
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = async () => {
    if (!isSignedIn) {
      Alert.alert(t('common.error'), t('settings.notSignedIn'));
      return;
    }

    setIsDeleting(true);
    try {
      // Removes only this account's data from the device; other accounts and
      // signed-out notes on a shared phone stay.
      const result = await deleteAccountAndLocalData();

      if (!result.success) {
        Alert.alert(t('common.error'), t('settings.deleteAccountError'));
        return;
      }

      setShowDeleteConfirm(false);
      Alert.alert(t('settings.accountDeleted'), t('settings.accountDeletedMessage'));
    } catch (error) {
      console.error('Error deleting account:', error);
      Alert.alert(t('common.error'), t('settings.deleteAccountError'));
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    isSignedIn,
    showDeleteConfirm,
    isDeleting,
    openDeleteConfirm: () => setShowDeleteConfirm(true),
    closeDeleteConfirm: () => setShowDeleteConfirm(false),
    handleClearCache,
    handleDeleteAccount,
  };
}
