import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const SUPABASE_URL = "https://izdmmudfrmqhvlgepwes.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MKaLNxnqvYbJUyik9zN7WA_r4ie2P5d";

// Registration is intentionally isolated from the authoritative registry session.
// The existing registry client remains the only client that persists/signs in users.
const signupClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const panel = document.querySelector(".registry-panel");
const auth = panel?.querySelector(".registry-auth");
const email = auth?.querySelector('input[type="email"]');
const password = auth?.querySelector('input[type="password"]');
const signIn = auth?.querySelector("button.primary");
const message = panel?.querySelector(".registry-message");
const heading = panel?.querySelector(".registry-heading .field-label");

if (!panel || !auth || !email || !password || !signIn || !message || !heading) {
  throw new Error("Student registration UI mismatch.");
}

function installStyles() {
  if (document.querySelector("style[data-vlab-student-registration]")) return;
  const style = document.createElement("style");
  style.dataset.vlabStudentRegistration = "";
  style.textContent = `
    .registry-auth-intro { margin: 0 0 2px; color: #52656d; font-size: 12px; line-height: 1.45; }
    .registry-auth-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .registry-auth-actions > button { width: 100%; }
    .registry-create-account { border-color: #2f6d82; color: #17485b; font-weight: 700; background: #f2f8fa; }
    .registry-create-account:hover:not(:disabled) { background: #e8f3f6; border-color: #245b6e; }
    .registry-auth-note { margin: 0; color: #78888e; font-size: 10.5px; line-height: 1.4; }
    @media (max-width: 460px) {
      .registry-auth-actions { grid-template-columns: 1fr; }
      .registry-auth-actions > button { min-height: 44px; }
    }
  `;
  document.head.append(style);
}

function setMessage(text, state = "idle") {
  message.textContent = text;
  message.dataset.state = state;
}

function setBusy(busy) {
  email.disabled = busy;
  password.disabled = busy;
  signIn.disabled = busy;
  createAccount.disabled = busy;
}

const intro = document.createElement("p");
intro.className = "registry-auth-intro";
intro.textContent = "New to Virtual Lab? Create an account here. Already registered? Sign in.";

const actions = document.createElement("div");
actions.className = "registry-auth-actions";
const createAccount = document.createElement("button");
createAccount.type = "button";
createAccount.className = "registry-create-account";
createAccount.textContent = "Create account";
createAccount.setAttribute("data-vlab-create-account", "true");

actions.append(signIn, createAccount);
auth.prepend(intro);
auth.append(actions);

const note = document.createElement("p");
note.className = "registry-auth-note";
note.textContent = "Accounts are for your private experiments. New accounts start with the Student role.";
auth.append(note);

async function signUp() {
  const value = email.value.trim();
  const secret = password.value;
  if (!value || !secret) {
    setMessage("Enter your email and a password first.", "error");
    return;
  }

  setBusy(true);
  setMessage("Creating your account…");
  try {
    const { data, error } = await signupClient.auth.signUp({ email: value, password: secret });
    if (error) throw error;
    password.value = "";

    if (data.session) {
      setMessage("Account created. Sign in to continue.", "success");
    } else {
      setMessage("Account created. Check your email to confirm it, then return here and sign in.", "success");
    }
  } catch (error) {
    console.error(error);
    setMessage(error instanceof Error ? error.message : String(error), "error");
  } finally {
    setBusy(false);
  }
}

createAccount.addEventListener("click", signUp);

function syncSignedOutPresentation() {
  const signedOut = !auth.hidden;
  heading.textContent = signedOut ? "Sign in or create account" : "Account";

  for (const selector of ['[data-vlab-nav="account"]', '[data-vlab-nav="account-mobile"]']) {
    for (const button of document.querySelectorAll(selector)) {
      const text = signedOut ? "Sign in" : "Account";
      if (button.textContent !== text) button.textContent = text;
    }
  }
}

const observer = new MutationObserver(syncSignedOutPresentation);
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["hidden"],
  characterData: true,
});

installStyles();
syncSignedOutPresentation();
panel.setAttribute("data-vlab-student-registration", "ready");
