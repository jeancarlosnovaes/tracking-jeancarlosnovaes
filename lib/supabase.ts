import { createClient } from '@supabase/supabase-js';

// Usa a service_role key (nunca a anon key aqui) porque este código
// roda só no servidor (API route), nunca no browser.
export const supabase = createClient(
	process.env.SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
	{ auth: { persistSession: false } }
);
