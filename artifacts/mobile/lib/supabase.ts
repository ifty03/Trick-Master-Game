import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

function buildClient(extraHeaders?: Record<string, string>): SupabaseClient {
  if (!supabaseUrl) {
    throw new Error(
      "EXPO_PUBLIC_SUPABASE_URL is not set. Please add it in the Secrets panel."
    );
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: extraHeaders
      ? { headers: extraHeaders }
      : undefined,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionFromUrl: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });
}

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) _supabase = buildClient();
  return _supabase;
}

export function getSupabaseWithToken(token: string | null): SupabaseClient {
  if (!token) return getSupabase();
  return buildClient({ Authorization: `Bearer ${token}` });
}
