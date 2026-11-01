import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey && url.startsWith('http')
    ? createClient(url, anonKey, {
        realtime: { params: { eventsPerSecond: 40 } },
      })
    : null;
