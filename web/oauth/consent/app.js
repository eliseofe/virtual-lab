import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const SUPABASE_URL = "https://izdmmudfrmqhvlgepwes.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MKaLNxnqvYbJUyik9zN7WA_r4ie2P5d";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: "vlab-production-registry-auth-v1" },
});

const $ = (id) => document.getElementById(id);
const ui = {
  identity: $("identity"),
  message: $("message"),
  auth: $("auth-panel"),
  consent: $("consent-panel"),
  invalid: $("invalid-panel"),
  email: $("email"),
  password: $("password"),
  signIn: $("sign-in"),
  signUp: $("sign-up"),
  client: $("oauth-client"),
  scopes: $("oauth-scopes"),
  approve: $("oauth-approve"),
  deny: $("oauth-deny"),
};

const authorizationId = new URLSearchParams(location.search).get("authorization_id");
const confirmationRedirectUrl = new URL(location.href);
confirmationRedirectUrl.hash = "";

let user = null;
let rendering = false;

function showMessage(text, kind = "info") {
  ui.message.textContent = text;
  ui.message.className = `message${kind === "error" ? " error" : ""}`;
  ui.message.hidden = !text;
}

function showOnly(panel) {
  ui.auth.hidden = panel !== ui.auth;
  ui.consent.hidden = panel !== ui.consent;
  ui.invalid.hidden = panel !== ui.invalid;
}

async function displayName() {
  if (!user) return "Signed out";
  const { data } = await supabase.from("profiles").select("display_name").maybeSingle();
  return data?.display_name || user.email || "Signed in";
}

async function render() {
  if (rendering) return;
  rendering = true;
  try {
    showMessage("");
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    user = data.session?.user ?? null;
    ui.identity.textContent = await displayName();

    if (!authorizationId) {
      showOnly(ui.invalid);
      return;
    }

    if (!user) {
      showOnly(ui.auth);
      return;
    }

    const oauth = supabase.auth.oauth;
    if (!oauth) throw new Error("OAuth authorization is unavailable in this browser session.");
    const { data: details, error: detailsError } = await oauth.getAuthorizationDetails(authorizationId);
    if (detailsError) throw detailsError;
    if (!details) throw new Error("OAuth authorization request was not found.");

    if (!("authorization_id" in details)) {
      if (!details.redirect_url) throw new Error("OAuth authorization response did not include a redirect URL.");
      location.assign(details.redirect_url);
      return;
    }

    ui.client.textContent = details.client?.name ?? "AI client";
    ui.scopes.textContent = details.scope?.trim() || "email";
    showOnly(ui.consent);
  } catch (error) {
    console.error(error);
    showMessage(error?.message ?? String(error), "error");
    showOnly(user ? ui.consent : ui.auth);
  } finally {
    rendering = false;
  }
}

async function authenticate(mode) {
  showMessage("");
  const email = ui.email.value.trim();
  const password = ui.password.value;
  if (!email || !password) throw new Error("Enter email and password.");

  if (mode === "signin") {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  } else {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: email.split("@")[0] },
        emailRedirectTo: confirmationRedirectUrl.toString(),
      },
    });
    if (error) throw error;
    if (!data.session) {
      showMessage("Account created. Confirm the email, then return here to continue connecting your AI assistant.");
      return;
    }
  }

  await render();
}

async function run(action) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    showMessage(error?.message ?? String(error), "error");
  }
}

ui.signIn.addEventListener("click", () => run(() => authenticate("signin")));
ui.signUp.addEventListener("click", () => run(() => authenticate("signup")));
ui.approve.addEventListener("click", () => run(async () => {
  const { data, error } = await supabase.auth.oauth.approveAuthorization(authorizationId);
  if (error) throw error;
  location.assign(data.redirect_url);
}));
ui.deny.addEventListener("click", () => run(async () => {
  const { data, error } = await supabase.auth.oauth.denyAuthorization(authorizationId);
  if (error) throw error;
  location.assign(data.redirect_url);
}));

supabase.auth.onAuthStateChange(() => queueMicrotask(() => render()));
await render();
