import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

// Usamos la service role key: el backend opera con privilegios completos.
// Nunca exponer esta key al cliente.
export const supabase: SupabaseClient = createClient(
  config.supabase.url,
  config.supabase.serviceKey,
  {
    auth: { persistSession: false },
  },
);
