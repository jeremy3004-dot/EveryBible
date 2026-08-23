import type { Session } from '@supabase/supabase-js';
import type { User } from '../types';

interface InitializedAuthStateInput {
  session: Session | null;
  user: User | null;
}

interface InitializedAuthState {
  session: Session | null;
  user: User | null;
  isAuthenticated: boolean;
}

interface UserStateUpdateInput {
  session: Session | null;
  user: User | null;
}

interface UserStateUpdate {
  user: User | null;
  isAuthenticated: boolean;
}

interface AuthBoundaryResetInput {
  previousUserId: string | null;
  nextUserId: string | null;
  lastSyncedUserId: string | null;
}

export interface AuthBoundaryEffects {
  resetPerUserState: () => void;
  resetPreferences: () => void;
  clearGuestTombstones: () => void;
}

// Guest reading progress/preferences intentionally survive the first account
// creation. Account A->B, stale owner markers, and session expiry still reset;
// guest unenroll tombstones are consumed separately before authentication.
export const shouldResetPerUserStateAtAuthBoundary = ({
  previousUserId,
  nextUserId,
  lastSyncedUserId,
}: AuthBoundaryResetInput): boolean =>
  nextUserId
    ? (Boolean(previousUserId) && previousUserId !== nextUserId) ||
      Boolean(lastSyncedUserId && lastSyncedUserId !== nextUserId)
    : Boolean(previousUserId || lastSyncedUserId);

export const applyAuthBoundaryEffects = (
  input: AuthBoundaryResetInput,
  effects: AuthBoundaryEffects
): 'reset' | 'guest' | 'none' => {
  if (shouldResetPerUserStateAtAuthBoundary(input)) {
    effects.resetPerUserState();
    effects.resetPreferences();
    return 'reset';
  }

  if (input.nextUserId && !input.previousUserId && !input.lastSyncedUserId) {
    effects.clearGuestTombstones();
    return 'guest';
  }

  return 'none';
};

export const resolveInitializedAuthState = ({
  session,
  user,
}: InitializedAuthStateInput): InitializedAuthState => {
  if (!session || !user) {
    return {
      session: null,
      user: null,
      isAuthenticated: false,
    };
  }

  return {
    session,
    user,
    isAuthenticated: true,
  };
};

export const resolveUserStateUpdate = ({
  session,
  user,
}: UserStateUpdateInput): UserStateUpdate => ({
  user,
  isAuthenticated: session !== null,
});
