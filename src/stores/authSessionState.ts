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
