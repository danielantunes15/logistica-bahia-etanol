// Este arquivo exporta a conexão com o Supabase para ser usada em outros arquivos.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// MUDANÇA: Carrega as chaves via objeto global window.env
const SUPABASE_URL = window.env.SUPABASE_URL;
const SUPABASE_KEY = window.env.SUPABASE_KEY_ANON;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);