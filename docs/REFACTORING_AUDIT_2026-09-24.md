# Refactoring Audit — 24 September 2026

Status: **audit input for #425 Refactoring / technical debt (living domain)**. This document is a findings report, not execution authority. Execution still follows `DEVELOPMENT_WORKFLOW.md`: one substantial, independently testable ticket at a time, each driven to production green.

Audited revision: `baf9406` (`main` lineage, "#525 Complete read-only scientific state for Metrics").

---

## 1. Summary in plain language

Virtual Lab works and is well-guarded in one specific way: almost every past change came with a test. The Rust kernel and the typecheck are clean, and 568 of 570 JavaScript tests pass locally (the other 2 need Docker, which this audit environment doesn't have; CI runs them).

The code has grown by **layering new modules on top of old ones instead of reshaping them**. The main consequences:

1. **The tests protect the wording of the code, not its behaviour.** About three quarters of the JavaScript test assertions search the source files for exact text (variable names, exact lines). Any real refactor will "fail" those tests even if the product still works, and a behaviour-breaking change can still pass them. **This has to be addressed first**, before any significant refactor, or "don't break anything" can't be checked.
2. **The web page's hidden HTML acts as the app's shared memory.** Modules pass state to each other by writing text into DOM elements and watching for changes (20+ `MutationObserver`s, two of them watching the entire page). The React/Mantine interface you see mostly **reads text back out of the older hidden interface and clicks its hidden buttons**. That works, but it's fragile and slow to change.
3. **The same code exists in several copies:** 8 byte-identical compiler/runtime files copied into the Supabase function, 4 separate expression parsers for the 4 authoring languages, 2 separate interpreters in Rust, and 8 separately created Supabase clients (7 of them sharing one login session).
4. **Some old backend database functions look like they were never removed.** Superseded versions of capability-closure functions (`…_v8`, unsuffixed, older `submit_*`) are still granted to logged-in users according to the migration history. This needs a production check and belongs in the security domain (#301).

None of this is urgent from a user's point of view. It all makes future work slower and riskier. The recommended order (section 6) starts with low-risk safety-net work and leaves the large structural changes until behavioural tests are in place.

---

## 2. System map (for whoever does the refactor)

| Layer | Location | Size | Notes |
|---|---|---|---|
| Scientific kernel | `crates/kernel/src` (Rust → WASM) | ~5.2k lines | Physics, neighbour index, controller IR interpreter, metrics IR interpreter, RNG |
| Kernel benchmarks | `crates/kernel/examples` | 13 files | Neighbour-search research benchmarks; not shipped |
| Web runtime | `web/src/worker.js`, `web/src/runtime/*` | ~600 lines | Web Worker hosting WASM; message protocol to `main.js` |
| Authoring compilers | `web/src/{config,initializer,controller,environment,metrics}/compiler.js` | ~2.5k lines | Python-like source → IR; must match the Rust runtime |
| Legacy UI (vanilla JS) | `web/src/*.js` | ~11k lines | Registry, library, showcase, professor inbox, results, persistence, onboarding |
| React/Mantine layer | `web/src/*.tsx`, `*-react-adapter.ts` | ~1.5k lines | Built by Vite as one library bundle (`react-migration-root.js`) |
| Static build | `web/scripts/build.mjs` | — | Copies `src/` verbatim into a hashed asset dir; rewrites `index.html` by string replace |
| Supabase edge function | `supabase/functions/experiment-mcp` | ~2.4k lines + vendor | MCP server; imports a vendored copy of the browser compilers |
| Database | `supabase/migrations` | 52 files, ~12.9k lines SQL | RLS, 41 `security definer` functions |
| Tests | `web/tests` (113 files, named by issue), `crates/kernel/tests` + inline Rust tests | — | |
| Production smokes | `web/scripts/*-smoke.mjs`, `web/product-surface.json` | — | Run **only after deploy**, against production |

Boot order today (important for any refactor of wiring):

```text
index.html
 ├─ metrics-runtime-bridge.js → results-ui.js, result-persistence.js
 ├─ main.js                     (worker, compilers, canvas)
 ├─ runtime-speed.js            (speed meter) ──dynamic import──► registry-ui-v3.js ► professor-inbox.js ► professor-development-links.js
 ├─ workspace-shell.js          → 11 side-effect imports (library, registration, onboarding, showcase, …, ux-hardening, ui-clarity)
 └─ react-migration-root.js     (injected by build.mjs; reads/drives the DOM above)
```

---

## 3. Baseline health (measured during this audit)

| Check | Result |
|---|---|
| `cargo test --workspace` | ✅ all pass |
| `node --test web/tests/*.test.mjs` | 568 / 570 pass; the 2 failures are `issue465-…` and `issue466-…`, which start a Docker Postgres container. They fail (not skip) when Docker is unavailable |
| `npm run typecheck` | ✅ clean |
| `cargo clippy --workspace --all-targets` | ~70 warnings (dead code, `too_many_arguments` up to 16 args, manual `div_ceil`, unused imports). Not run in CI |
| `cargo fmt --check` | 315 diff hunks. Kernel is not rustfmt-formatted. Not run in CI |

Anyone refactoring should re-run these four commands before and after each change:

```bash
cargo test --workspace
(cd web && npm ci && npm test && npm run typecheck)
cargo clippy --workspace --all-targets   # informational until cleaned up
```

---

## 4. Ground rules for refactoring without breaking anything

1. **Behaviour tests before structural change.** For any module being restructured, first add tests that exercise behaviour through public functions or the browser (section 5, F1). Only then delete the source-text regex tests that pin the old structure. Never delete a regex test without replacing what it protected.
2. **Scientific parity is sacred.** Compiler/runtime changes must keep `issue380-authoring-rust-parity`, the RNG contract (`docs/RNG_CONTRACT.md`) and `docs/SCIENTIFIC_CONTRACT.md` invariants intact. For anything touching compilers or the kernel, freeze a golden corpus first: compile every Showcase/catalog Experiment and record IR plus a fixed-seed run trace, then require bit-identical output after the refactor.
3. **Don't rewrite migrations.** Applied migrations are history. Fixes go in new migrations.
4. **Keep the vendored edge copies byte-identical** (F8) until a verified alternative exists; the Supabase function bundle must stay self-contained.
5. **One ticket = one concern.** Mechanical changes (formatting, renames, file moves) go in their own commits/tickets, separate from logic changes, so diffs stay reviewable.
6. **Production smoke is the final gate** for anything under `web/` or `crates/` (per `DEVELOPMENT_WORKFLOW.md`).

---

## 5. Findings

Severity is about **refactoring value × risk of leaving it**, not about user-visible bugs. Effort: S (< 1 day), M (1–3 days), L (multi-ticket).

### F1 — Tests assert source text instead of behaviour · **Critical enabler** · M→L

**Evidence.** 2,367 of 3,123 assertions in `web/tests` are `assert.match` / `assert.doesNotMatch`, mostly against source files loaded with `readFile`. 60+ test files read `web/src/*` directly. Example (`issue409-…`):

```js
assert.match(registry, /currentUi\.discardWorkingCopy\.hidden = !owned \|\| !currentWorkingCopy/);
assert.match(discard, /\.delete\(\{ count: "exact" \}\)/);
```

**Why it matters.** These tests pin variable names, statement order and file placement. A correct refactor fails them, and a broken one can pass (for example, the code is still there but no longer wired to the button). The suite can't be the safety net for refactoring as it stands.

**Recommendation.**
- Classify each test file: (a) real behavioural tests (compiler, RNG, runtime, scheduler, persistence core; keep as they are), (b) source-shape tests on UI modules (replace), (c) SQL-shape tests on migrations (keep; they check history that can't change).
- For (b), add behavioural coverage in one of two ways: extract pure logic out of UI modules into importable functions and unit-test them, or add browser tests that run against a **local** build (see F2).
- Retire each regex test only when its behavioural replacement exists, one module at a time and together with that module's refactor.
- Make Docker-dependent tests `skip` with a clear message when `docker` is unavailable (keep them mandatory in CI through an env flag, e.g. `VLAB_REQUIRE_DOCKER=1`).

### F2 — No browser-level check before production · **High** · M

**Evidence.** `.github/workflows/ci-pages.yml` runs the browser smokes (`run-active-product-smoke.mjs`) only in the `smoke` job, after `deploy`, against `https://eliseofe.github.io/virtual-lab/`. Pull requests get unit/source tests only.

**Why it matters.** A UI refactor is first exercised in a real browser **after it is live**. The workflow's repair loop copes with this, but it makes UI refactoring expensive and puts production at risk.

**Recommendation.** Add a pre-deploy job that serves `web/dist` locally (`node:http` static server) and runs the smokes that don't write to the database (e.g. `browser-smoke`, `frontend-foundation-smoke`, `responsive-smoke`, `catalog-metric-smoke`) against `http://127.0.0.1:<port>/`. Reuse `smoke-browser-harness.mjs` as the workflow requires. Scripts that need auth or mutate production data stay post-deploy only. Chromium is available on `ubuntu-latest`.

### F3 — The DOM is the application's state store · **High** · L

**Evidence.**
- `web/src/simulation-react-adapter.ts`, `results-react-adapter.ts` and `authoring-react-adapter.ts` build React props by reading `textContent`, `disabled` and `hidden` from legacy elements (`#run-state`, `#scientific-time`, `#physics-ticks`, …). `react-migration-root.tsx` drives actions via `proxyClick(selector)` on hidden legacy buttons.
- `runtime-speed.js` computes the speed factor by parsing `#scientific-time.textContent` inside a `MutationObserver`.
- 20+ `MutationObserver`s across 16 files. `ux-hardening.js` and `workspace-shell.js` observe `document.body` with `subtree: true` (the latter also watches attributes and characterData), so they fire on every live-results text update during a run.
- Module coordination also uses `CustomEvent`s with inconsistent naming (`vlab:metric-batch` vs `vlab-open-experiment-library`) and one global (`window.__vlabResultsUI`).

**Why it matters.** Renaming an element id, changing a label's wording or reordering markup can silently break another module. It is the main reason UI changes need so many source-text tests. Whole-body observers also add work to every frame while a simulation runs.

**Recommendation (staged, each stage independently deployable).**
1. Introduce a tiny typed store module (e.g. `web/src/state/runtime-store.ts`: `get/subscribe/set`, no dependency) fed directly from worker messages in `main.js`: run state, seed, scientific time, tick counts, speed.
2. Point `simulation-react-adapter` and `runtime-speed` at the store instead of DOM text. Legacy DOM keeps being written for now, so nothing else changes.
3. Repeat for the results and authoring adapters.
4. Replace `proxyClick` with calls to exported command functions (`run()`, `pause()`, `restart()`…) in `main.js`.
5. Narrow or remove the two whole-body observers once the elements they wait for are created by known code paths.
6. Standardise event names under one prefix and document them in one place.

### F4 — Implicit boot order and side-effect-only modules · **Medium** · S→M

**Evidence.** See the boot diagram in §2. `runtime-speed.js` (a speed meter) is also the loader of the registry and professor UIs. `workspace-shell.js` imports 11 modules only for their side effects. Several modules `throw` at import time if an element is missing (e.g. `runtime-speed.js`: `"Runtime speed meter UI mismatch."`). `build.mjs` rewrites `index.html` with hard-coded `.replace('src="./main.js"', …)` calls, so adding or renaming an entry script silently breaks the build rewrite.

**Recommendation.** Create one `web/src/bootstrap.js` that imports modules in an explicit, commented order and gives each one a named `init()` export with isolated error handling (preserving the current "registry failure must not block the simulator" behaviour). Make `index.html` load just that entry plus the React root. Let `build.mjs` rewrite all `./*.js|css` references generically, or have `verify-dist.mjs` assert every referenced asset exists.

### F5 — Eight Supabase clients, credentials copied eight times · **Medium** · S

**Evidence.** `createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, …)` appears in `registry-ui-v3.js`, `experiment-library.js`, `professor-inbox.js`, `professor-development-links.js`, `showcase.js`, `collection-organization.js`, `results-presentation-bridge.js` (all seven with `storageKey: "vlab-production-registry-auth-v1"`; `showcase.js` via a constant) and `student-registration.js` (non-persistent signup client). The URL and key constants are copied into each file, and `student-onboarding.js` hard-codes the MCP URL. The esm.sh CDN version is also repeated per file.

**Why it matters.** Seven auth clients on one storage key means seven auth listeners and seven token-refresh timers. supabase-js serialises refresh with a lock, but this is still the known "multiple GoTrueClient instances" configuration and a plausible cause of intermittent sign-out or stale-session reports. Changing project, key or library version needs 8 edits.

**Recommendation.** Add `web/src/supabase-client.js` exporting `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `MCP_URL`, a single shared `supabase` client and a `createSignupClient()` factory. Replace the per-file constructions. It is a low-risk, high-clarity first code ticket, but some source-regex tests assert the old constants (F1), so update them in the same ticket.

### F6 — CSS living inside JavaScript and patching other modules · **Medium** · M

**Evidence.** 13 modules inject `<style>` elements at runtime. `experiment-management.js` alone contains 54 `!important` rules. `ui-clarity.js` rewrites text that `index.html` just rendered (`setText("h1", "Virtual Lab")`, `.eyebrow` → `"SWARM ROBOTICS"`) and hides elements other modules create, all under `html[data-vlab-ui-clarity="true"]`. `showcase-professor-placement.js` exists only to inject one media query.

**Recommendation.** Move each injected stylesheet verbatim into a `.css` file linked from `index.html` (no visual change, easy to verify with the responsive smoke). Then fold `ui-clarity.js` text changes into `index.html` itself, and remove the `!important` escalations one component at a time. Delete `showcase-professor-placement.js` once its rule lives in CSS.

### F7 — Oversized UI modules · **Medium** · L (after F1/F3)

| File | Lines | Top-level functions | Module-level `let` |
|---|---|---|---|
| `registry-ui-v3.js` | 2,396 | 99 | 22 |
| `experiment-library.js` | 1,203 | 46 | 11 |
| `professor-inbox.js` | 982 | 34 | 7 |
| `showcase.js` | 743 | 34 | — |
| `main.js` | 656 | 22 | 17 |

`registry-ui-v3.js` mixes Supabase data access, revision/working-copy logic, autosave, DOM construction and event wiring. The `-v3` suffix no longer distinguishes it from anything.

**Recommendation.** Split each file along seams that already exist in it: `registry/api.js` (all `supabase.from/rpc` calls; pure and testable with a fake client), `registry/revisions.js` (working copy / revision state machine; pure), `registry/view.js` (DOM). Rename to drop `-v3`. Do this only after F1 has behavioural coverage for the module, because the current tests pin these exact file names and lines.

### F8 — Vendored compiler copies are hand-synchronised · **Medium** · S

**Evidence.** `supabase/functions/experiment-mcp/vendor/` holds byte-identical copies of `config`, `controller`, `environment`, `initializer`, `metrics` compilers, `rng.js` and `runtime/contract.js`, and `capability-bindings.js` is copied once more at the function root. Identity is asserted piecemeal across ~6 issue-numbered tests (`issue143`, `issue205`, `issue305`, `issue306`, `issue375`, …). No script produces the copies.

**Why it matters.** Vendoring is justified (the Supabase function bundle must be self-contained), but a developer who edits a browser compiler has to know to copy it by hand. Coverage of the identity checks depends on which issue tests happen to exist.

**Recommendation.** Add `web/scripts/sync-edge-vendor.mjs` with a declarative list of `[browser path, edge path]` pairs and `--check` mode, plus one `vendor-parity.test.mjs` that runs `--check` for **all** pairs. Keep the old scattered assertions until the new test has been green once, then remove the duplicates. Document the command in `docs/DEPLOYMENT.md`.

### F9 — Four hand-written parsers for four authoring languages · **Medium value, high risk** · L

**Evidence.** Separate `ExprParser` classes and/or `tokenize` functions exist in `controller/compiler.js` (l.101), `metrics/compiler.js` (l.232), `initializer/compiler.js` (l.34/64) and `environment/compiler.js` (l.97). Helpers are copy-pasted and differ only in the error class, e.g. `indentation()` and `intersectAliasSets()` (identical in controller and metrics). Alias-lowering passes (`lowerNeighbourIterableAliases*` vs `lowerMetricIterableAliases*`) follow the same pattern.

**Why it matters.** A syntax fix or new operator has to be made up to four times, and the Rust parity tests only cover what they sample.

**Recommendation.** Extract a shared `web/src/authoring-core/` (line/indent reader, tokenizer, expression parser parameterised by allowed names/operators and error class, common type-inference helpers). Migrate one language at a time, starting with the smallest (environment, then initializer), with a golden corpus of accepted and rejected sources per language and exact diagnostic text (message, line, column) compared before and after. The shared core must be added to the F8 vendor list. Don't combine this with any language-feature change.

### F10 — Rust kernel structure and hygiene · **Medium** · S→M

**Evidence.**
- `crates/kernel/src/entry.rs` is the crate root and does `include!("lib.rs")` after declaring `mod metrics_ir;`. This textual include is surprising, confuses tooling and hides the real module tree.
- `controller_ir.rs` (1,559 lines) and `metrics_ir.rs` (1,357 lines) each define their own `Value`, `Statement`, `Expression`, `ConditionalBranch`, `at_line`, `binary`. The controller compiles to a prepared stack program. Metrics tree-walks and dispatches binary ops **by string** at runtime (`fn binary(op: &str, …)`).
- `lib.rs` mixes geometry, physics, observation, simulation loop, JSON parsing and the `wasm_bindgen` API.
- Clippy: ~70 warnings, including functions with 12–16 parameters and dead code in neighbour-index structs used only by `examples/`.
- Not rustfmt-formatted (315 hunks).

**Recommendation (in this order).**
1. *Mechanical, own ticket:* `cargo fmt` plus trivial clippy fixes (`div_ceil`, `is_multiple_of`, unused imports), then add `cargo fmt --check` to CI. Zero behaviour change; the golden trace (§4.2) proves it.
2. Replace `include!` with a normal `lib.rs` root (`mod metrics_ir; …`), and move the `wasm_bindgen` surface into `wasm_api.rs`. Keep the exported JS names identical, and check the `wasm-pack` output `.d.ts` diff is empty.
3. Split `lib.rs` into `geometry.rs`, `physics.rs`, `observation.rs`, `simulation.rs`, `initial_state.rs`.
4. Put benchmark-only index methods behind `#[cfg(any(test, feature = "bench"))]` or move them to the examples.
5. *Optional, performance lane (#56), not a refactor ticket:* resolve metrics operators to an enum at prepare time, the way the controller IR does. Needs the golden trace and a benchmark.

### F11 — Superseded database functions still callable · **High (security domain)** · S to verify

**Evidence (from migration history; production must be checked).** Grants to `authenticated` exist for `submit_capability_closure`, `revalidate_capability_closure`, `submit_extension_closure`, `submit_structured_extension_closure`, `revalidate_structured_extension_closure`, `submit_structured_extension_closure_v8`, `revalidate_structured_extension_closure_v8`, and later `_v11`. The edge function calls only `_v11` (`index.ts` l.747, l.949). Across all migrations only 3 `drop function` statements appear, none for these. `triage_extension_request` is redefined 4 times (normal), but the versioned-name pattern (`_v8`, `_v11`) leaves every old signature alive.

**Why it matters.** If the old functions are still deployed, a logged-in user calling them directly via PostgREST could bypass invariants that newer versions added (classified requirements, lifecycle rules). That may be harmless, but it should be proven rather than assumed.

**Recommendation.** Route to **#301 Security / identity / authorization** (audit child #302 is already defined). Query production `pg_proc` and grants, then in a new migration `revoke execute … from authenticated` (or `drop`) for every superseded signature no client uses. Add a SQL test asserting that only the allow-listed RPCs are executable by `authenticated`.

### F12 — Edge function and deployment process · **Medium** · M

**Evidence.**
- `supabase/functions/experiment-mcp/index.ts` is 1,043 lines. `registerExperimentTools` alone spans roughly lines 334–970, and `supabase` is typed `any`.
- `canonical-capability-bindings.js` is a 7-line compatibility re-export of `capability-bindings.js`.
- The repository doesn't document how migrations and the edge function are deployed. `docs/DEPLOYMENT.md` covers only GitHub Pages, and CI deploys neither, so repo-to-production drift can only be found by manual inspection.

**Recommendation.** Split tool registration into one file per tool group (experiments, collections, capability requests, metrics/results already separate). Type the client with generated Supabase types or a narrow interface. Remove the compatibility re-export once no importer remains. Document the Supabase deploy procedure in `docs/DEPLOYMENT.md`, and optionally add a read-only CI check that lists applied migrations against `supabase/migrations`.

### F13 — CI configuration gaps · **Medium** · S

**Evidence.** `ci-pages.yml` has `paths-ignore: '.github/workflows/**'` for both `push` and `pull_request`, so **a change to the workflow itself is never validated by CI** until some unrelated change triggers it. There's no `cargo clippy` or `cargo fmt` step (see F10). Docker tests hard-fail locally (F1).

**Recommendation.** Remove `.github/workflows/**` from `paths-ignore`, or add a lightweight workflow-lint job (e.g. `actionlint`) that runs on workflow changes. Before doing so, check against the development workflow what an unintended deploy on a workflow-only push would mean. Add fmt/clippy steps after F10 step 1.

### F14 — Tests organised by issue number · **Low** · M (do together with F1)

113 test files are named `issueNNN-*.test.mjs`. To find the tests for, say, the metrics compiler, you need to grep. Behaviour is spread across files by history rather than by module. **Recommendation:** new behavioural tests go in module-named files (`metrics-compiler.test.mjs`, `registry-revisions.test.mjs`, …), with the issue number kept in the test name string for traceability. Old issue files shrink naturally as F1 replaces them.

### F15 — Small cleanups · **Low** · S

- `.github/workflows/ci-pages.yml` concurrency group is named `virtual-lab-ci-pages-v3-…`. Harmless, but the version suffix has no meaning now.
- `main.js` has 17 module-level `let`s; worker message types are untyped string literals on both sides. A shared `worker-protocol.js` with constants and JSDoc typedefs would catch typos.
- `Cargo.lock` is not committed (and isn't in `.gitignore`), so every CI run resolves the newest `serde`/`wasm-bindgen` versions. Since the crate builds a shipped WASM artifact, committing the lockfile would make builds reproducible, which fits the project's reproducibility goals.
- `react-migration-root.tsx` / `#react-migration-root` naming: the migration is the production UI now; rename when F3/F4 settle.

---

## 6. Suggested ticket sequence under #425

Each item is one substantial, independently testable ticket. They are ordered so that every later ticket has a safety net from an earlier one. None has started; each needs owner go-ahead per `DEVELOPMENT_WORKFLOW.md`.

| # | Ticket | Findings | Risk | Deployable? |
|---|---|---|---|---|
| 1 | **Safety net:** Docker tests skip locally; single `vendor-parity` test + sync script; golden corpus for compilers (IR) and kernel (fixed-seed trace) | F1 (part), F8, §4.2 | Very low | Tests/scripts only |
| 2 | **Pre-deploy browser smoke** against local `dist` for read-only surfaces | F2 | Low | CI only |
| 3 | **Rust mechanical cleanup:** `cargo fmt`, trivial clippy fixes, `include!` → normal module root, fmt check in CI | F10.1–2, F13 | Low (golden trace) | Yes (WASM rebuild) |
| 4 | **Single Supabase client module** | F5 | Low | Yes |
| 5 | **Extract injected CSS to files** | F6 (part) | Low (responsive smoke) | Yes |
| 6 | **Explicit bootstrap entry** | F4 | Medium | Yes |
| 7 | **Runtime state store; simulation adapter + speed meter off DOM text** | F3.1–2, F1 for those modules | Medium | Yes |
| 8 | **Results + authoring adapters off DOM; replace `proxyClick`** | F3.3–4 | Medium | Yes |
| 9+ | **Split `registry-ui-v3.js`** (then library, inbox) with behavioural tests replacing regex tests | F7, F1, F14 | Medium | Yes |
| later | **Shared authoring-language core**, one language per ticket | F9 | High (scientific) | Yes |
| later | **Edge function split + deploy docs** | F12 | Medium | Edge deploy |
| — | **Superseded RPC revoke/drop**: belongs to #301/#302, not #425 | F11 | — | DB migration |

Tickets 1–5 are safe to hand to any agent. Tickets 6 onward change how modules talk to each other and should be reviewed diff-by-diff.

## 7. Deliberately *not* recommended

- **Rewriting the UI wholesale in React.** The staged adapter-to-store path (F3) gets most of the benefit without a big-bang cutover.
- **Removing the vendored edge copies** by importing across directories. It is unverified that the Supabase bundler would accept this, and it would break the self-contained function directory. Automate the copy (F8) instead.
- **Editing or squashing applied migrations.**
- **Changing any scientific semantics** (units, RNG streams, measurement phase, observation contract) as part of a refactor.
