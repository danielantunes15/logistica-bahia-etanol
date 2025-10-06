// Este arquivo exporta a conexão com o Supabase para ser usada em outros arquivos.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = 'https://uogorpanshybcuhdekhg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvZ29ycGFuc2h5YmN1aGRla2hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2MTcxNzYsImV4cCI6MjA3NTE5MzE3Nn0.LSGlAeeLZsPnEw3GtEXzY4D9f3UZhk7SXyBgrGYaKMg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);