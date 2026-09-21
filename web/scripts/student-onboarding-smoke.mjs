import { createSmokeSession } from "./smoke-browser-harness.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  return result?.result?.value;
}

async function state(send) {
  const raw = await evaluate(send, `JSON.stringify((() => {
    const visible = (element) => Boolean(element && !element.hidden && element.getClientRects().length > 0);
    const panel = document.querySelector('.registry-panel');
    const auth = panel?.querySelector('.registry-auth');
    const heading = panel?.querySelector('.registry-heading .field-label');
    const signIn = panel?.querySelector('[data-vlab-sign-in]');
    const createMode = panel?.querySelector('[data-vlab-create-account-mode]');
    const create = panel?.querySelector('[data-vlab-create-account]');
    const backToSignIn = panel?.querySelector('[data-vlab-back-to-sign-in]');
    const firstName = panel?.querySelector('input[autocomplete="given-name"]');
    const lastName = panel?.querySelector('input[autocomplete="family-name"]');
    const help = document.querySelector('[data-vlab-nav="help"]');
    const helpPanel = document.querySelector('#vlab-student-help');
    const grok = helpPanel?.querySelector('[data-vlab-provider="grok"]');
    const claude = helpPanel?.querySelector('[data-vlab-provider="claude"]');
    const firstPrompt = helpPanel?.querySelector('[data-vlab-first-prompt]');
    const account = document.querySelector('[data-vlab-nav="account"]');
    return {
      worker: document.querySelector('#worker-status')?.dataset.state ?? null,
      registrationReady: panel?.getAttribute('data-vlab-student-registration') ?? null,
      authHidden: Boolean(auth?.hidden),
      authMode: auth?.dataset.mode ?? null,
      heading: heading?.textContent?.trim() ?? null,
      signInVisible: visible(signIn),
      createModeVisible: visible(createMode),
      createAccountVisible: visible(create),
      backToSignInVisible: visible(backToSignIn),
      firstNameVisible: visible(firstName),
      lastNameVisible: visible(lastName),
      help: Boolean(help),
      helpPanel: Boolean(helpPanel),
      helpHidden: Boolean(helpPanel?.hidden),
      helpTitle: helpPanel?.querySelector('#vlab-student-help-title')?.textContent?.trim() ?? null,
      grok: Boolean(grok),
      claude: Boolean(claude),
      firstPrompt: firstPrompt?.textContent?.trim() ?? null,
      accountText: account?.textContent?.trim() ?? null,
    };
  })())`);
  return JSON.parse(raw ?? "null");
}

async function waitReady(send) {
  let latest = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    latest = await state(send);
    if (latest?.worker === "ready" && latest.registrationReady === "ready" && latest.help && latest.helpPanel) return latest;
    await sleep(100);
  }
  throw new Error(`student onboarding did not become ready: ${JSON.stringify(latest)}`);
}

let session;
let cdp;
try {
  session = await createSmokeSession({ url });
  cdp = session.cdp;
  await cdp.send("Runtime.enable");

  const initial = await waitReady(cdp.send);
  if (
    initial.authHidden
    || initial.authMode !== "sign-in"
    || initial.heading !== "Sign In"
    || !initial.signInVisible
    || !initial.createModeVisible
    || initial.createAccountVisible
    || initial.backToSignInVisible
    || initial.firstNameVisible
    || initial.lastNameVisible
    || initial.accountText !== "Sign In"
  ) {
    throw new Error(`signed-out Sign In surface is incorrect: ${JSON.stringify(initial)}`);
  }

  await evaluate(cdp.send, `document.querySelector('[data-vlab-create-account-mode]').click()`);
  await sleep(30);
  const createAccountMode = await state(cdp.send);
  if (
    createAccountMode.authMode !== "create"
    || createAccountMode.heading !== "Create Account"
    || createAccountMode.signInVisible
    || createAccountMode.createModeVisible
    || !createAccountMode.createAccountVisible
    || !createAccountMode.backToSignInVisible
    || !createAccountMode.firstNameVisible
    || !createAccountMode.lastNameVisible
  ) {
    throw new Error(`Create Account mode is incorrect: ${JSON.stringify(createAccountMode)}`);
  }

  await evaluate(cdp.send, `document.querySelector('[data-vlab-back-to-sign-in]').click()`);
  await sleep(30);
  const returnedToSignIn = await state(cdp.send);
  if (
    returnedToSignIn.authMode !== "sign-in"
    || returnedToSignIn.heading !== "Sign In"
    || !returnedToSignIn.signInVisible
    || !returnedToSignIn.createModeVisible
    || returnedToSignIn.firstNameVisible
    || returnedToSignIn.lastNameVisible
  ) {
    throw new Error(`return to Sign In is incorrect: ${JSON.stringify(returnedToSignIn)}`);
  }

  await evaluate(cdp.send, `document.querySelector('[data-vlab-nav="help"]').click()`);
  await sleep(50);
  const opened = await state(cdp.send);
  if (opened.helpHidden || opened.helpTitle !== "Use Virtual Lab" || !opened.grok || !opened.claude || !opened.firstPrompt) {
    throw new Error(`Getting started did not open correctly: ${JSON.stringify(opened)}`);
  }

  const providerState = JSON.parse(await evaluate(cdp.send, `JSON.stringify((() => {
    document.querySelector('[data-vlab-provider="claude"]').click();
    return {
      claudePressed: document.querySelector('[data-vlab-provider="claude"]')?.getAttribute('aria-pressed'),
      claudeHidden: document.querySelector('[data-vlab-provider-panel="claude"]')?.hidden,
      grokHidden: document.querySelector('[data-vlab-provider-panel="grok"]')?.hidden,
    };
  })())`));
  if (providerState.claudePressed !== "true" || providerState.claudeHidden || !providerState.grokHidden) {
    throw new Error(`provider switching failed: ${JSON.stringify(providerState)}`);
  }

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 700, deviceScaleFactor: 1, mobile: true });
  await sleep(80);
  const mobilePanel = JSON.parse(await evaluate(cdp.send, `JSON.stringify((() => {
    const helpPanel = document.querySelector('#vlab-student-help');
    const close = helpPanel?.querySelector('.vlab-student-help-close');
    const style = helpPanel ? getComputedStyle(helpPanel) : null;
    if (helpPanel) helpPanel.scrollTop = helpPanel.scrollHeight;
    return {
      open: Boolean(helpPanel && !helpPanel.hidden),
      clientHeight: helpPanel?.clientHeight ?? 0,
      scrollHeight: helpPanel?.scrollHeight ?? 0,
      scrollTop: helpPanel?.scrollTop ?? 0,
      overflowY: style?.overflowY ?? null,
      closeHeight: Math.round(close?.getBoundingClientRect().height ?? 0),
      withinViewport: Boolean(helpPanel && helpPanel.getBoundingClientRect().top >= -1 && helpPanel.getBoundingClientRect().bottom <= window.innerHeight + 1),
    };
  })())`));
  if (!mobilePanel.open || mobilePanel.scrollHeight <= mobilePanel.clientHeight || mobilePanel.scrollTop <= 0 || !["auto", "scroll"].includes(mobilePanel.overflowY) || mobilePanel.closeHeight < 44 || !mobilePanel.withinViewport) {
    throw new Error(`mobile Getting started is not safely scrollable: ${JSON.stringify(mobilePanel)}`);
  }

  await evaluate(cdp.send, `document.querySelector('.vlab-student-help-close').click()`);

  // Regression for the production freeze: repeatedly mutate the exact hidden state
  // observed by registration/onboarding. A self-triggering MutationObserver loop makes
  // the following bounded CDP call time out instead of hanging the CI job forever.
  const observerStress = JSON.parse(await evaluate(cdp.send, `(async () => {
    const auth = document.querySelector('.registry-auth');
    const professor = document.querySelector('#professor-menu');
    if (!auth) throw new Error('registry auth missing');
    localStorage.removeItem('vlab-student-getting-started-v1');
    for (let i = 0; i < 20; i += 1) {
      auth.hidden = i % 2 === 0;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    auth.hidden = false;
    if (professor) professor.hidden = true;
    await new Promise((resolve) => setTimeout(resolve, 40));
    return JSON.stringify({
      heading: document.querySelector('.registry-heading .field-label')?.textContent?.trim() ?? null,
      accountText: document.querySelector('[data-vlab-nav="account"]')?.textContent?.trim() ?? null,
      registrationReady: document.querySelector('.registry-panel')?.getAttribute('data-vlab-student-registration') ?? null,
    });
  })()`));
  if (observerStress.heading !== "Sign In" || observerStress.accountText !== "Sign In" || observerStress.registrationReady !== "ready") {
    throw new Error(`registration observer stress regressed: ${JSON.stringify(observerStress)}`);
  }

  // Exercise the first-login Getting started path without creating a real account.
  // The product intentionally opens after a 700ms timer; verify the resulting state
  // with a finite deadline rather than assuming one exact scheduler tick.
  const autoOpened = JSON.parse(await evaluate(cdp.send, `(async () => {
    const auth = document.querySelector('.registry-auth');
    const professor = document.querySelector('#professor-menu');
    localStorage.removeItem('vlab-student-getting-started-v1');
    const helpPanel = document.querySelector('#vlab-student-help');
    helpPanel.hidden = true;
    auth.hidden = true;
    if (professor) professor.hidden = true;
    const deadline = performance.now() + 3000;
    while (helpPanel.hidden && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const result = {
      opened: Boolean(!helpPanel.hidden),
      title: helpPanel.querySelector('#vlab-student-help-title')?.textContent?.trim() ?? null,
    };
    auth.hidden = false;
    helpPanel.hidden = true;
    return JSON.stringify(result);
  })()`));
  if (!autoOpened.opened || autoOpened.title !== "Use Virtual Lab") {
    throw new Error(`first-login Getting started did not auto-open: ${JSON.stringify(autoOpened)}`);
  }

  if (cdp.exceptions.length) throw new Error(`browser exceptions: ${JSON.stringify(cdp.exceptions)}`);
  console.log(JSON.stringify({ initial, createAccountMode, returnedToSignIn, opened, providerState, mobilePanel, observerStress, autoOpened }, null, 2));
  console.log("Student registration and Getting started verified in production, including mobile scrollability and bounded observer-freeze regression coverage.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (cdp?.exceptions?.length) console.error("JavaScript exceptions:", cdp.exceptions);
  if (session?.getChromeLog()?.trim()) console.error("Chrome stderr:\n" + session.getChromeLog());
  process.exitCode = 1;
} finally {
  try { await session?.close(); } catch {}
}
