import { supabase, isSupabaseConfigured } from '../supabase';

export interface AccountActionResult {
  success: boolean;
  error?: string;
}

export const deleteCurrentAccount = async (): Promise<AccountActionResult> => {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase is not configured' };
  }

  try {
    const { error } = await supabase.rpc('delete_my_account');

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
