interface WorkflowEnv {
  langQuestAllowedProjectIds: string[];
  langQuestStorageBucket: string | null;
  langQuestSupabaseKey: string | null;
  langQuestSupabaseUrl: string | null;
  r2AccessKeyId: string | null;
  r2Bucket: string | null;
  r2Endpoint: string | null;
  r2SecretAccessKey: string | null;
  supabaseServiceRoleKey: string;
  supabaseUrl: string;
}

export function getWorkflowEnv(env = process.env): WorkflowEnv {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Workflows require NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  return {
    langQuestAllowedProjectIds: (env.LANGQUEST_ALLOWED_PROJECT_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    langQuestStorageBucket: env.LANGQUEST_STORAGE_BUCKET ?? null,
    langQuestSupabaseKey: env.LANGQUEST_SUPABASE_SERVICE_ROLE_KEY ?? null,
    langQuestSupabaseUrl: env.LANGQUEST_SUPABASE_URL ?? null,
    r2AccessKeyId: env.R2_ACCESS_KEY_ID ?? null,
    r2Bucket: env.R2_BUCKET ?? null,
    r2Endpoint: env.R2_ENDPOINT ?? null,
    r2SecretAccessKey: env.R2_SECRET_ACCESS_KEY ?? null,
    supabaseServiceRoleKey,
    supabaseUrl,
  };
}
