import { createClient } from '@supabase/supabase-js';
import { getSupabaseUrl } from './config';

export function getSupabaseServiceRoleKey(): string {
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() ??
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error('Missing environment variable: SUPABASE_SECRET_KEY');
  }
  return key;
}

export function createServiceClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

