import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Inicialização segura para evitar quebra no import se as chaves estiverem ausentes
export const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase credentials missing. Realtime updates disabled.");
    return null;
  }
  return createClient(supabaseUrl, supabaseAnonKey);
};
