// Este arquivo exporta a conexão com o Supabase para ser usada em outros arquivos.
// CORREÇÃO: Alterado de cdn.jsdelivr.net para esm.sh para corrigir o erro 'AuthClient'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// MUDANÇA: Carrega as chaves via objeto global window.env
const SUPABASE_URL = window.env.SUPABASE_URL;
const SUPABASE_KEY = window.env.SUPABASE_KEY_ANON;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);