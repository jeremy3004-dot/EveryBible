export interface EveryBibleOperatorEnv {
  serviceRoleKey: string;
  supabaseUrl: string;
}

function readEnv(name: string): string {
  const value = process.env[name];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`EveryBible operator is missing required environment variable: ${name}`);
  }

  return value;
}

export function getEveryBibleOperatorEnv(): EveryBibleOperatorEnv {
  return {
    serviceRoleKey: readEnv('SUPABASE_SERVICE_ROLE_KEY'),
    supabaseUrl: readEnv('NEXT_PUBLIC_SUPABASE_URL'),
  };
}
