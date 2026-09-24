// The one persisted Supabase client shared by every browser module (#541).
// All modules therefore see the same session and a single token refresh.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { AUTH_STORAGE_KEY, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.js";

export { createClient };

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: AUTH_STORAGE_KEY },
});
