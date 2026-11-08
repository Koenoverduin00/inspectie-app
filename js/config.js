// Verbinding met Supabase (online opslag en synchronisatie tussen pc en telefoon).
// De publishable/anon key is bedoeld om in de app te staan; de beveiliging zit in de
// Row Level Security-regels uit supabase/schema.sql. Zet hier NOOIT de service_role key.
// Beide waarden kunnen ook per apparaat worden ingesteld via Instellingen.
export const SUPABASE_URL = 'https://dreuvdlnoxgljujgokmt.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_7gZ8xb6KffsJ5PR0QBAOGQ_ZsxSM3sd';
