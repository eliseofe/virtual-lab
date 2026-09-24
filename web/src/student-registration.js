import { createClient } from "./supabase-client.js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.js";


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
const account = panel?.querySelector(".registry-account");

if (!panel || !auth || !email || !password || !signIn || !message || !heading || !account) {
  throw new Error("Student registration UI mismatch.");
}

function setMessage(text, state = "idle") {
  message.textContent = text;
  message.dataset.state = state;
}

const nameRow = document.createElement("div");
nameRow.className = "registry-signup-name-row";
nameRow.hidden = true;

const firstName = document.createElement("input");
firstName.type = "text";
firstName.autocomplete = "given-name";
firstName.placeholder = "First name";
firstName.setAttribute("aria-label", "First name");

const lastName = document.createElement("input");
lastName.type = "text";
lastName.autocomplete = "family-name";
lastName.placeholder = "Last name";
lastName.setAttribute("aria-label", "Last name");
nameRow.append(firstName, lastName);

const actions = document.createElement("div");
actions.className = "registry-auth-actions";

signIn.textContent = "Sign In";
signIn.setAttribute("data-vlab-sign-in", "true");

const createMode = document.createElement("button");
createMode.type = "button";
createMode.textContent = "Create Account";
createMode.setAttribute("data-vlab-create-account-mode", "true");

const createAccount = document.createElement("button");
createAccount.type = "button";
createAccount.className = "primary";
createAccount.textContent = "Create Account";
createAccount.setAttribute("data-vlab-create-account", "true");
createAccount.hidden = true;

const backToSignIn = document.createElement("button");
backToSignIn.type = "button";
backToSignIn.textContent = "Sign In";
backToSignIn.setAttribute("data-vlab-back-to-sign-in", "true");
backToSignIn.hidden = true;

actions.append(signIn, createMode, createAccount, backToSignIn);
auth.prepend(nameRow);
auth.append(actions);

let authMode = "sign-in";

function setBusy(busy) {
  firstName.disabled = busy;
  lastName.disabled = busy;
  email.disabled = busy;
  password.disabled = busy;
  signIn.disabled = busy;
  createMode.disabled = busy;
  createAccount.disabled = busy;
  backToSignIn.disabled = busy;
}

function applyAuthMode({ focus = false, clearMessage = false } = {}) {
  const creating = authMode === "create";
  auth.dataset.mode = authMode;
  nameRow.hidden = !creating;
  signIn.hidden = creating;
  createMode.hidden = creating;
  createAccount.hidden = !creating;
  backToSignIn.hidden = !creating;
  password.autocomplete = creating ? "new-password" : "current-password";

  if (!auth.hidden) {
    heading.textContent = creating ? "Create Account" : "Sign In";
    panel.setAttribute("aria-label", heading.textContent);
  }

  if (clearMessage) setMessage("");

  if (focus) {
    (creating ? firstName : email).focus();
  }
}

function setAuthMode(nextMode, options = {}) {
  authMode = nextMode;
  applyAuthMode(options);
}

async function signUp() {
  const given = firstName.value.trim();
  const family = lastName.value.trim();
  const value = email.value.trim();
  const secret = password.value;
  if (!given || !family || !value || !secret) {
    setMessage("Enter first name, last name, email and password.", "error");
    return;
  }

  setBusy(true);
  setMessage("Creating account…");
  try {
    const { data, error } = await signupClient.auth.signUp({
      email: value,
      password: secret,
      options: {
        data: {
          first_name: given,
          last_name: family,
          display_name: `${given} ${family}`,
        },
      },
    });
    if (error) throw error;

    password.value = "";
    firstName.value = "";
    lastName.value = "";
    setAuthMode("sign-in", { focus: false, clearMessage: false });

    if (data.session) {
      setMessage("Account created. Sign in to continue.", "success");
    } else {
      setMessage("Account created. Check your email to confirm it, then sign in.", "success");
    }
  } catch (error) {
    console.error(error);
    setMessage(error instanceof Error ? error.message : String(error), "error");
  } finally {
    setBusy(false);
  }
}

createMode.addEventListener("click", () => {
  setAuthMode("create", { focus: true, clearMessage: true });
});

backToSignIn.addEventListener("click", () => {
  setAuthMode("sign-in", { focus: true, clearMessage: true });
});

createAccount.addEventListener("click", signUp);

// The registry owns ordinary sign-in Enter handling. Registration mode intercepts
// Enter before that listener so the two authentication paths cannot cross.
password.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || authMode !== "create") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  signUp();
}, { capture: true });

function syncAuthPresentation() {
  const signedOut = !auth.hidden;
  document.body.dataset.vlabAuthState = signedOut ? "signed-out" : "signed-in";

  if (!signedOut && authMode !== "sign-in") {
    setAuthMode("sign-in", { focus: false, clearMessage: false });
  }

  const headingText = signedOut
    ? (authMode === "create" ? "Create Account" : "Sign In")
    : "Account";
  if (heading.textContent !== headingText) heading.textContent = headingText;

  account.hidden = signedOut;
  panel.setAttribute("aria-label", signedOut ? headingText : "Virtual Lab account");

  for (const selector of ['[data-vlab-nav="account"]', '[data-vlab-nav="account-mobile"]']) {
    for (const button of document.querySelectorAll(selector)) {
      const text = signedOut ? "Sign In" : "Account";
      if (button.textContent !== text) button.textContent = text;
      if (button.getAttribute("aria-label") !== text) button.setAttribute("aria-label", text);
    }
  }

  if (signedOut && message.dataset.state === "idle") setMessage("");
}

const authObserver = new MutationObserver(syncAuthPresentation);
authObserver.observe(auth, {
  attributes: true,
  attributeFilter: ["hidden"],
});

const chromeRoot = document.querySelector("#react-migration-root");
if (chromeRoot) {
  const chromeObserver = new MutationObserver(syncAuthPresentation);
  chromeObserver.observe(chromeRoot, {
    childList: true,
    subtree: true,
  });
}
applyAuthMode();
syncAuthPresentation();
panel.setAttribute("data-vlab-student-registration", "ready");
