import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../../stores/authStore';
import { clearDeviceCaches } from '../../../stores/deviceCaches';
import { deleteAccountAndLocalData } from '../../../services/account';

interface DeleteOwner {
  uid: string;
  authGeneration: number;
}

/** Clear Cache and Delete Account: the two destructive actions under Data. */
export function useDataSettings() {
  const { t } = useTranslation();
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const authGeneration = useAuthStore((state) => state.authGeneration);
  const isSignedIn = uid !== null;
  const [deleteOwner, setDeleteOwner] = useState<DeleteOwner | null>(null);
  const ownerRef = useRef<DeleteOwner | null>(null);
  const requestRef = useRef<object | null>(null);
  const mountedRef = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const clearDeleteConfirm = () => {
    ownerRef.current = null;
    requestRef.current = null;
    setDeleteOwner(null);
    setIsDeleting(false);
  };
  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = useAuthStore.subscribe((state, previous) => {
      if (
        state.user?.uid !== previous.user?.uid ||
        state.authGeneration !== previous.authGeneration
      ) {
        clearDeleteConfirm();
      }
    });
    return () => {
      mountedRef.current = false;
      ownerRef.current = null;
      requestRef.current = null;
      unsubscribe();
    };
  }, []);
  const isCurrentOwner = (owner: DeleteOwner | null): owner is DeleteOwner => {
    const current = useAuthStore.getState();
    return (
      mountedRef.current &&
      owner !== null &&
      current.user?.uid === owner.uid &&
      current.authGeneration === owner.authGeneration
    );
  };
  const isCurrentConfirmation = () =>
    ownerRef.current === deleteOwner && isCurrentOwner(deleteOwner);
  const openDeleteConfirm = () => {
    if (uid === null || !isCurrentOwner({ uid, authGeneration }) || requestRef.current) return;
    const owner = { uid, authGeneration };
    ownerRef.current = owner;
    setDeleteOwner(owner);
  };
  const closeDeleteConfirm = () => {
    if (isCurrentConfirmation() && !requestRef.current) clearDeleteConfirm();
  };

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
    if (!isCurrentConfirmation() || deleteOwner === null || requestRef.current) return;
    const request = {};
    requestRef.current = request;
    const isCurrentRequest = () => requestRef.current === request && isCurrentConfirmation();
    setIsDeleting(true);
    try {
      // Removes only the account that confirmed; shared-phone accounts and guest notes stay.
      const result = await deleteAccountAndLocalData(deleteOwner.uid, deleteOwner.authGeneration);
      if (!isCurrentRequest()) return;
      if (!result.success) {
        Alert.alert(t('common.error'), t('settings.deleteAccountError'));
        return;
      }
      clearDeleteConfirm();
      Alert.alert(t('settings.accountDeleted'), t('settings.accountDeletedMessage'));
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error('Error deleting account:', error);
      Alert.alert(t('common.error'), t('settings.deleteAccountError'));
    } finally {
      if (isCurrentRequest()) {
        requestRef.current = null;
        setIsDeleting(false);
      }
    }
  };

  return {
    isSignedIn,
    showDeleteConfirm: deleteOwner !== null,
    isDeleting,
    openDeleteConfirm,
    closeDeleteConfirm,
    handleClearCache,
    handleDeleteAccount,
  };
}
