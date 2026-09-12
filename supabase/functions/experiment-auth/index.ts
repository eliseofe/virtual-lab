import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}')
const PUBLISHABLE_KEY = publishableKeys.default ?? Deno.env.get('SUPABASE_ANON_KEY')!

const html = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Virtual Lab — Authorize AI access</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: Canvas; color: CanvasText; }
    main { width: min(92vw, 560px); border: 1px solid color-mix(in srgb, CanvasText 20%, transparent); border-radius: 14px; padding: 24px; }
    h1 { margin-top: 0; font-size: 1.35rem; }
    p, li { line-height: 1.45; }
    label { display: grid; gap: 6px; margin: 12px 0; }
    input { font: inherit; padding: 9px 10px; border-radius: 8px; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); }
    button { font: inherit; padding: 9px 13px; border-radius: 8px; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); cursor: pointer; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
    .muted { opacity: .72; }
    .error { color: #b42318; white-space: pre-wrap; }
    code { overflow-wrap: anywhere; }
  </style>
</head>
<body>
<main>
  <h1>Virtual Lab experiment access</h1>
  <p class="muted">This authorization grants an AI client access only to your Virtual Lab experiment registry. It does not grant simulator, GitHub, shell, filesystem, deployment, or automatic simulation-result access.</p>
  <div id="status">Loading authorization request…</div>

  <section id="login" hidden>
    <p>Sign in to the Virtual Lab experiment registry.</p>
    <label>Email <input id="email" type="email" autocomplete="email" /></label>
    <label>Password <input id="password" type="password" autocomplete="current-password" /></label>
    <div class="row">
      <button id="signin">Sign in</button>
      <button id="signup">Create account</button>
    </div>
    <p id="auth-error" class="error"></p>
  </section>

  <section id="consent" hidden>
    <p><strong id="client-name">AI client</strong> is requesting access.</p>
    <ul>
      <li>Read and edit experiments you own.</li>
      <li>Create and organize experiment collections.</li>
      <li>Archive, restore, and permanently delete eligible working experiments.</li>
    </ul>
    <p class="muted">Requested scopes: <code id="scopes"></code></p>
    <p class="muted">Redirect: <code id="redirect"></code></p>
    <div class="row">
      <button id="approve">Approve</button>
      <button id="deny">Deny</button>
      <button id="signout">Sign out</button>
    </div>
    <p id="consent-error" class="error"></p>
  </section>
</main>
<script type="module">
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

  const supabase = createClient(${JSON.stringify(SUPABASE_URL)}, ${JSON.stringify(PUBLISHABLE_KEY)})
  const params = new URLSearchParams(location.search)
  const authorizationId = params.get('authorization_id')
  const status = document.querySelector('#status')
  const login = document.querySelector('#login')
  const consent = document.querySelector('#consent')
  const authError = document.querySelector('#auth-error')
  const consentError = document.querySelector('#consent-error')

  async function render() {
    if (!authorizationId) {
      status.textContent = 'Missing authorization_id. Start authorization from the MCP client.'
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      status.hidden = true
      login.hidden = false
      consent.hidden = true
      return
    }

    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
    if (error) {
      status.hidden = false
      status.textContent = 'Authorization request could not be loaded.'
      consentError.textContent = error.message
      return
    }

    status.hidden = true
    login.hidden = true
    consent.hidden = false
    document.querySelector('#client-name').textContent = data.client?.name ?? data.client_name ?? 'AI client'
    document.querySelector('#scopes').textContent = (data.scopes ?? []).join(' ') || 'email'
    document.querySelector('#redirect').textContent = data.redirect_uri ?? ''
  }

  document.querySelector('#signin').addEventListener('click', async () => {
    authError.textContent = ''
    const email = document.querySelector('#email').value
    const password = document.querySelector('#password').value
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) authError.textContent = error.message
    else await render()
  })

  document.querySelector('#signup').addEventListener('click', async () => {
    authError.textContent = ''
    const email = document.querySelector('#email').value
    const password = document.querySelector('#password').value
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: email.split('@')[0] } } })
    if (error) authError.textContent = error.message
    else if (!data.session) authError.textContent = 'Account created. Confirm the email if Supabase asks you to, then sign in.'
    else await render()
  })

  document.querySelector('#approve').addEventListener('click', async () => {
    consentError.textContent = ''
    const { data, error } = await supabase.auth.oauth.approveAuthorization(authorizationId)
    if (error) consentError.textContent = error.message
    else location.assign(data.redirect_url)
  })

  document.querySelector('#deny').addEventListener('click', async () => {
    consentError.textContent = ''
    const { data, error } = await supabase.auth.oauth.denyAuthorization(authorizationId)
    if (error) consentError.textContent = error.message
    else location.assign(data.redirect_url)
  })

  document.querySelector('#signout').addEventListener('click', async () => {
    await supabase.auth.signOut()
    await render()
  })

  await render()
</script>
</body>
</html>`

Deno.serve((req: Request) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 })
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; script-src 'unsafe-inline' https://esm.sh; connect-src 'self' https://*.supabase.co; style-src 'unsafe-inline'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    },
  })
})
