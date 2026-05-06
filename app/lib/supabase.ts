import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient("https://wscmxbfhyxgevkwbjbud.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzY214YmZoeXhnZXZrd2JqYnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MjkxNTUsImV4cCI6MjA4OTIwNTE1NX0.XJtfbCc1cPrFCmxjizYrai9Cpa6hp4ZLVgapBPWdFzA");