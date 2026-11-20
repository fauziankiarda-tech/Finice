const SUPABASE_URL = "https://ekqvylmydpnajtckdeyc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_aoQZkjdxWVXPZACGkTVHhw_kTbUA9X_";

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);
