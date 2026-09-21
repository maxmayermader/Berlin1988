# Stack Research

**Domain:** Web board-game UI refinement (typography/theming, animation, accessible primitives, monorepo deployment) for Berlin 1988 v1.1
**Researched:** 2026-09-14
**Confidence:** MEDIUM (web-search findings cross-checked against official docs — next.js.org, vercel.com/docs, motion.dev, base-ui.com, radix-ui.com, fonts.google.com — no Context7 library-doc pulls were needed since every question was ecosystem/how-to shaped rather than API-reference shaped)

**Scope note:** This file covers ONLY new additions/changes for v1.1. Next.js 15.5.23, React 19.2.0, PartyKit 0.0.115, partysocket 1.3.0, Zustand 5.0.15, Zod 4.4.3, Tailwind CSS 4.3.0, Motion 13.1.0, Vitest 2.1.9, Playwright, and pnpm 9.15.4 workspaces are already validated and installed — see `.planning/codebase/STACK.md` for that inventory. Nothing below replaces them.

## Recommended Stack

### Core Technologies (new for v1.1)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `radix-ui` (unified package) | 1.6.7 | Accessible Popover, Dialog, Tooltip primitives | Unstyled by design (pure `data-state`/`data-side` attribute hooks, no CSS-in-JS) so it drops straight into Tailwind v4 utilities; handles focus trap, portal stacking, and keyboard nav that a hand-rolled settings modal or card popover would otherwise get subtly wrong. Multi-year production track record — the safer of two close options (see Alternatives). The unified `radix-ui` entry point (added 2026) replaces installing a dozen separate `@radix-ui/react-*` packages; it's tree-shaken per-primitive so unused components add ~0kb |
| `next/font/google` (built into Next 15, no install) | n/a | Self-hosted declassified-dossier typefaces | Already the project's font-loading mechanism by convention (Next.js docs). Google-hosted fonts are proxied and self-hosted at build time — no third-party runtime request, no CLS, works with the existing CSP posture |

### Supporting Libraries

None required beyond the one above. Paper texture, stamps, and redaction bars are CSS/SVG markup (see below) — zero packages. The animated resolution replay is built on the already-installed Motion 13.1.0 — zero packages. FFA-16/18 maps are TypeScript data files in the existing `duel12.ts` pattern — zero packages.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vitest (existing) | Map-invariant tests for FFA-16/18 | Add a `map-invariants.test.ts` alongside the existing `rules.test.ts`/`fog-leak.test.ts` style — reachability, sector balance, informant/extraction node counts. No new test framework; see "Map authoring tooling" below |
| Biome (existing, config still pending per `.planning/codebase/STACK.md`) | Accessibility lint rules | Biome ships its own a11y lint rules (`useAltText`, `useValidAriaProps`, `useAriaPropsForRole`, etc.) — once the Biome config lands, no separate `eslint-plugin-jsx-a11y` is needed |

## Installation

```bash
# apps/web only
pnpm --filter web add radix-ui
```

No `pnpm install -D` additions. `next/font/google` ships inside the already-installed `next` package.

---

## Typography: typewriter/monospace and stamp typefaces

**Recommendation — two-face system, both Google Fonts under SIL OFL 1.1:**

| Role | Typeface | Weights needed | Why |
|------|----------|-----------------|-----|
| Body / UI monospace (Intel counters, cooldown badges, signals log, card costs) | **Courier Prime** | 400, 700 (roman + bold; italic exists but unneeded here) | Purpose-built as "a better Courier" for long-form reading at body sizes (originally designed for screenplays, which is exactly this UI's density of small monospaced numbers and labels). Static (non-variable) but ships exactly the two weights the UI needs, so variable-font overhead buys nothing here |
| Stamps / headers / short display text ("BURNED," "CLASSIFIED," "EXTRACTED," route/screen titles) | **Special Elite** | 400 only (it's a single-weight display face) | The genuine distressed-typewriter look the "declassified dossier" direction wants. **Do not use it for body text or anything under ~16px** — its broken/ink-bled strokes that make it look authentic also cost legibility at small sizes. Reserve it for headline-scale, high-contrast, short strings only |

Both are OFL 1.1: free to embed, subset, and self-host (including commercial use); the only restrictions are not reselling the font file standalone and not redistributing under the same reserved font name after modification. No licensing review needed — this is the same license class already implicitly assumed for any Google Font.

**Loading — via `next/font/google`, not `next/font/local`:** these are Google-hosted fonts, so `next/font/google` self-hosts them at build time (proxied, no runtime request to fonts.googleapis.com, avoids the flash-of-unstyled-text problem, and matches the CSP-friendly self-hosting the codebase already leans toward). Expose both as CSS variables the same way the codebase already threads design tokens into `@theme` in `globals.css`:

```ts
// apps/web/app/fonts.ts (new file)
import { Courier_Prime, Special_Elite } from 'next/font/google';

export const courierPrime = Courier_Prime({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-mono-body',
  display: 'swap',
});

export const specialElite = Special_Elite({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-typewriter-display',
  display: 'swap',
});
```

Then map into `@theme` in `globals.css` next to the existing `--color-*`/`--font-weight-*` tokens — `--font-mono-body` and `--font-typewriter-display` are outside Tailwind v4's own reserved theme namespaces (unlike `--spacing-*`, which `globals.css` already correctly avoids), so declaring them is safe.

**Fallback stack:** `var(--font-mono-body), ui-monospace, 'Courier New', monospace` for body text, and `var(--font-typewriter-display), 'Courier New', monospace` for display — the system monospace fallback (`Courier New`) already reads as "typewriter" on every platform, so a slow/failed font load degrades gracefully into the same visual family rather than falling back to a sans-serif.

**Do not** reach for a third "stamp ink" or "rubber stamp" novelty font beyond Special Elite — it's the single display face the whole redesign needs; adding a second display face fragments the type system for no visual gain.

---

## Paper texture, stamps, and redaction bars: CSS/SVG, not raster assets

**No new dependency.** All of it is markup and CSS the existing Tailwind v4 + inline-SVG setup already supports.

**Paper grain:** an inlined SVG `feTurbulence` filter encoded as a CSS `background-image: url("data:image/svg+xml,...")` data URI — roughly 300–500 bytes, zero network requests, applied once as a `background-image` on a static wrapper element, layered under a subtle beige/manila gradient via `mix-blend-mode: multiply` at low opacity (5–10%). This is the standard "grainy gradient" pattern (used by CSS-Tricks, ibelick's grainy-background writeup, and freeCodeCamp's SVG-filter guide independently).

**Stamps** ("BURNED," "CLASSIFIED," "EXTRACTED"): a positioned text element, `rotate(-6deg to -10deg)` transform, a 2–3px border, wide `letter-spacing`, red/black color, and `mix-blend-mode: multiply` so it visually sits "on" the paper texture beneath it. No image asset — this is font + CSS transform + blend mode.

**Redaction bars:** a solid black block (`<div>`/SVG `<rect>`) with a slight random rotation. Real redacted documents are just solid bars — resist the urge to add a torn-paper or scan-artifact texture to these; a flat black rect reads correctly and costs nothing.

**Performance guidance — this matters because the board re-renders every round:**

1. **Never regenerate the data-URI string per render.** Hoist it to a module-level constant or a Tailwind utility class applied once; it must not be recomputed inside a component that re-renders on every `ResolutionEvent`.
2. **Keep texture layers out of the SVG board's own re-rendering subtree.** Apply the paper/grain background to a static wrapper `<div>` positioned behind the `<svg>` viewport (lower z-index), not as a filter *on* the SVG's nodes/edges. That way React re-rendering the board's tokens and edges every round never touches the DOM nodes carrying the texture — the texture layer paints once and stays untouched.
3. **Do not apply `feTurbulence` as a live CSS `filter:` on an element that animates or re-renders.** `feTurbulence`-based filters are evaluated per-pixel and are GPU-expensive on repeated composite; a *static* data-URI background-image (rasterized once by the browser after first paint) sidesteps this entirely. If a future design wants *animated* grain (film-grain flicker), that would be the one case to reconsider — not needed for v1.1's redesign brief.
4. **Scope texture overlays to specific panels, not a full-viewport layer**, especially on any surface that overlaps the resolution replay animation — a full-bleed overlay stacked over heavy Motion animation is the one combination search results consistently flag as janky on lower-end devices.

---

## Animation: is Motion 13 sufficient for the replay timeline?

**Yes — no new animation library needed.** Motion 13.1.0 (already installed) is sufficient for a timed, skippable, scrubbable replay timeline animating SVG tokens along map edges:

- `animate()` works across HTML and SVG elements alike (paths, `<g>`/`<circle>` tokens, CSS variables) — exactly what animating a token along a map edge needs.
- `useAnimate()` provides imperative sequencing: chain `await animate(...)` calls per `ResolutionEvent` (move, then scan, then strike, matching the existing `ARCHITECTURE.md` §9 beat order) to build the replay as an ordered sequence, not a single fire-and-forget transition.
- The controls object `useAnimate()`/`animate()` returns exposes `.time` (settable — this is the scrub handle), `.speed`, `.play()`, and `.pause()` — a scrub slider is a controlled input bound to `.time`, and "skip" is `.time = duration` or `.pause()` + jump.
- Animations built this way are explicitly documented as stateless and scrubbable, which is the exact requirement.

**Version note:** 13.1.0 is current in `apps/web/package.json` and already covers this API surface (it predates the Motion One/Framer Motion API merge that introduced `useAnimate`). Upstream has since shipped 13.1.1 (React 19 strict-mode/`AnimatePresence` fixes, non-browser `window` guards) and an unreleased 13.2.0 (`animate.addEffect()` for driving non-DOM subjects, e.g. Three.js — irrelevant here). Neither bump is required for the replay timeline; a patch bump to 13.1.1 is a reasonable low-risk pickup if the team is touching `package.json` anyway, but not a blocking dependency change.

**What NOT to add:** GSAP, anime.js, Remotion, Lottie, or a hand-rolled `requestAnimationFrame` timeline. The team already standardized on Motion with a shared reduced-motion utility (`apps/web/lib/motion.ts`); a second animation library would fragment that single reduced-motion code path — the exact problem `lib/motion.ts`'s own doc comment says it exists to prevent. Remotion in particular renders video files server-side; it is not for an interactive in-browser scrub timeline and would be the wrong tool entirely.

**Integration point:** extend `apps/web/lib/motion.ts` with the replay's duration/easing tokens (matching the existing `DURATION`/`EASING` constants and the ~700ms-per-beat 🔧 figure from `docs/ARCHITECTURE.md` §9), and build the actual sequence orchestration as a new component under `apps/web/components/board/` (the file `ARCHITECTURE.md` §9 already calls "the screen that matters most").

---

## Accessible popover/dialog/tooltip primitives: worth adding

**Recommendation: add the unified `radix-ui` package (1.6.7).** This is the one new runtime dependency proposed in this research.

**Why add a primitives library instead of hand-rolling:**
- Card detail popovers, a settings dialog, and cooldown tooltips all need focus trapping, `Escape`-to-close, click-outside detection, portal rendering above the SVG board, and focus-return-to-trigger on close. These are exactly the keyboard-navigation and ARIA requirements `apps/web/CLAUDE.md` rule 4 already mandates ("board is keyboard-navigable... every signal has a text form") — and they are the class of bug that's easy to get subtly wrong by hand (focus not returning, Tab escaping a modal, a portal stacking under the SVG).
- Unstyled by design: Radix exposes behavior via `data-state="open"`/`data-side="top"` attributes and leaves all visual styling to the consumer — this is a direct match for Tailwind v4's utility-class approach, no CSS-in-JS or `sx` prop to reconcile.

**Radix vs. Base UI vs. React Aria — the actual tradeoff:**

| | Radix (`radix-ui`) | Base UI (`@base-ui-components/react`) | React Aria Components |
|---|---|---|---|
| Styling model | Unstyled, `data-*` attribute hooks | Unstyled, Tailwind-native from the start | Unstyled, render-prop/hook-first |
| Maturity | Years in production, the library that popularized this pattern | Stable v1.0.0 shipped Dec 2025 (~9 months old as of this research) — actively developed, built partly by ex-Radix/Floating UI engineers | Very mature, Adobe-maintained, deepest accessibility primitives available (strong i18n/bidi support) |
| Verbosity | Low — component composition | Low — component composition | Higher — more code per component, hooks-first |
| Best fit here | Product work needing solid, boring reliability | Teams fully committed to Tailwind-only styling who are comfortable riding a newer library | Projects with strict international/WCAG-AA requirements beyond what this project's a11y bar (keyboard nav + non-color signal + reduced motion) calls for |

This project's accessibility bar is explicitly keyboard navigation + non-color sector encoding + reduced motion (per `.planning/PROJECT.md` Out of Scope: high-contrast theme was deselected but those three were kept) — it does not need React Aria's deeper i18n/bidi machinery, and Base UI's functionality is genuinely comparable but has roughly a tenth of Radix's time-in-production for a UI (card popovers, settings dialog) that gets used every single round. Radix is the boring, safe choice for a surface this frequently exercised. **This is a close call, not a strong rejection of Base UI** — if the team already prefers Base UI's single-package Tailwind-first ergonomics, it's a reasonable substitute with no functional gap identified.

**Which specific primitives, and where NOT to use one:**
- **Popover** — card detail hover/click popovers.
- **Dialog** — host settings modal, any full-screen confirmation (e.g., leave-match).
- **Tooltip** — cooldown/Intel-cost hints on hover.
- **Target picker (choosing a node/agent for an action) should stay a hand-rolled SVG-click interaction**, not a Radix `Select`/dropdown — the board's existing paradigm is clicking nodes directly on the map, and forcing that into a dropdown list would regress the spatial interaction the game is built around.
- **Simple lobby settings controls** (round timer, round limit as discrete choices, blockade mode toggle) — prefer plain semantic HTML (`<select>`, `<input type="range">`, native `<button>` toggle groups) over Radix `RadioGroup`/`ToggleGroup` where a native element already does the job with full built-in accessibility. Reach for Radix specifically where portaling/focus-trap/positioning is the hard part (Popover, Dialog, Tooltip) — not as a blanket replacement for native form controls.

**Bundle and Tailwind v4 implications:** the unified `radix-ui` entry point is tree-shaken per component actually imported (marked `/* @__PURE__ */`), so importing only `Popover`, `Dialog`, and `Tooltip` adds a small, bounded amount of JS — not the whole primitives catalogue. No CSS ships with it; all visual styling is new Tailwind utility classes written against Radix's `data-state`/`data-side` attributes, which is additive to (not a rewrite of) the existing token system in `globals.css`.

**What NOT to add:** a full styled component kit — shadcn/ui, Headless UI, Ariakit, MUI, Chakra UI, Mantine. All are either visually opinionated (conflicting with the bespoke declassified-dossier redesign) or duplicate what a few Radix primitives plus the existing Tailwind v4 tokens already cover. Also don't add Floating UI directly as a dependency — Radix's Popover and Tooltip already wrap it internally.

---

## Deploying `apps/web` (Next.js 15, pnpm workspace) to Vercel

This is the first-ever deploy of `apps/web`; `apps/party` is already live on Cloudflare via `partykit deploy` and is unaffected by any of this.

**1. `next.config.ts` needs `transpilePackages` added — this is currently missing and is very likely why local dev "just works" but a clean build would not.** `@berlin/shared` and `@berlin/engine` both ship raw TypeScript source with `"main": "./src/index.ts"` and no build step (confirmed by reading both `package.json` files) — they rely entirely on the consumer's bundler to compile them. Next.js's default webpack/Turbopack config does not run its TS/JSX loader over anything resolved from outside the app's own source tree unless it's told to, so a from-scratch Vercel install (no warm `.next` cache, no dev-server incremental state) needs this explicitly:

```ts
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@berlin/shared', '@berlin/engine'],
  webpack(config) {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
};
```

Flag this as a required code change for the deployment phase, not just a Vercel dashboard setting.

**2. Vercel Project Settings → Root Directory: `apps/web`.** Since `apps/party` is not a Vercel project (it deploys via `partykit deploy`), there is exactly one Vercel project for this repo.

**3. Enable "Include source files outside of the Root Directory" (Vercel's monorepo toggle).** Required so the build can see `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and the sibling `packages/*` directories that `apps/web`'s `workspace:*` dependencies point at — without it, the workspace packages aren't in the build's filesystem view at all. Modern Vercel often auto-enables this on `pnpm-workspace.yaml` detection, but verify it explicitly rather than assume.

**4. Install/Build commands: leave Vercel's pnpm auto-detection, no override needed.** Vercel detects the root `pnpm-lock.yaml` and runs `pnpm install` from the workspace root even when Root Directory is scoped to `apps/web`, then scopes the build step to that directory. Default Build Command (`next build`, from `apps/web/package.json`'s `"build"` script) is correct as-is.

**5. pnpm version pinning is already correct — no change needed.** Root `package.json` already declares `"packageManager": "pnpm@9.15.4"`; Vercel's Corepack-based detection reads this field and installs the matching pnpm version automatically. Nothing to add here.

**6. Add `"engines": { "node": ">=22.0.0" }` to the root `package.json`.** Not currently present. Pins the Node major version so a future Vercel platform default bump doesn't silently change the build's Node version out from under a project that assumes Node 22+ (per `.planning/codebase/STACK.md`).

**7. `NEXT_PUBLIC_PARTYKIT_HOST` — set in Vercel Project Settings → Environment Variables, not committed.** Set it to the bare host (e.g. `berlin1988-party.maxmayermader.partykit.dev`, no protocol prefix) for Production, Preview, and Development environments. Because it's a `NEXT_PUBLIC_*` variable, Next.js inlines it into the client bundle **at build time** — changing its value requires a redeploy, it will not take effect on a running deployment. `partysocket` infers `ws://` vs `wss://` from the page's own protocol, and since Vercel always serves over HTTPS, the connection will automatically negotiate `wss://` to the `*.partykit.dev` host — no protocol needs to be specified in the env var and no extra config is needed for the secure-WebSocket upgrade.

**8. Ignored Build Step: skip Turborepo for this.** `docs/ARCHITECTURE.md` mentions Turborepo as a planned monorepo tool, but there is no `turbo.json` in the repo today and only one Vercel project exists — `turbo-ignore` has nothing to gain here since there's no second Vercel project competing for skip logic. If build-skipping on unrelated commits (e.g., `apps/party`-only changes) is wanted later, a plain git-diff Ignored Build Step is sufficient and adds no dependency:

```bash
git diff --quiet HEAD^ HEAD -- apps/web packages/shared packages/engine pnpm-lock.yaml pnpm-workspace.yaml package.json && exit 0 || exit 1
```

Don't install Turborepo solely to get `turbo-ignore` — that's a real dependency and a `turbo.json` to maintain for a one-app monorepo; the git-diff command above does the same job.

---

## Map authoring/validation tooling: none needed

FFA-16 and FFA-18 should follow the exact pattern already established by `packages/engine/src/content/maps/duel12.ts` — a plain TypeScript data file (`RawNode[]`/`RawEdge[]` literals, `x`/`y` as layout percentages so the SVG board renders any map with no component changes) typed against `MapDefinition`/`MapNode` from `@berlin/shared`. This is already "data, not code" per the root `CLAUDE.md` rule, and it's already validated by:

- **TypeScript's structural typing** at compile time (`pnpm typecheck`) — a malformed node/edge/sector literal is a type error before it ever runs.
- **The existing Vitest suite generalizes for free** — `packages/engine/tests/rules.test.ts`, `fog-leak.test.ts`, and `soak.test.ts` already exercise arbitrary `MapDefinition` values, not just `duel-12` specifically.

**One small, in-pattern addition worth doing (no new tool):** a `map-invariants.test.ts` in `packages/engine/tests/` that runs the same handful of structural checks against every map in `content/maps/` — full graph connectivity/reachability, at least one extraction node per sector, informant-node counts within the design's expected range. This is a new *test file*, using the Vitest already in the stack — not a new dependency, and not a schema-validation library. Do not add a Zod schema for `MapDefinition` or a standalone map-linting CLI; TypeScript's type system plus this one test file already catches the class of authoring mistakes that matters (broken graphs, missing required node roles), and a second validation layer on top of both would be redundant for two more hand-authored map files.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `radix-ui` (unified) | `@base-ui-components/react` | If the team wants a Tailwind-native-from-day-one library and is comfortable with a library that's been stable for under a year; functionally comparable, genuinely a close call |
| `radix-ui` (unified) | `react-aria-components` | If the project later needs strict international/bidi accessibility beyond keyboard nav + non-color signaling + reduced motion (not the case for v1.1's stated a11y bar) |
| Static SVG-data-URI grain | Pre-rendered PNG/JPG noise texture, tiled | Only if a specific device profile shows the data-URI approach itself causing paint cost — unlikely at this scale, and a raster asset reintroduces a network request the data-URI avoids |
| Motion 13 `useAnimate` sequencing | GSAP Timeline | Never for this project — would duplicate the existing reduced-motion utility and animation mental model for no capability gain the current library lacks |
| `next/font/google` self-hosting | `next/font/local` with manually downloaded font files | Only if a chosen typeface isn't on Google Fonts; both Courier Prime and Special Elite are, so this isn't needed here |
| Plain git-diff Ignored Build Step | `turbo-ignore` / full Turborepo adoption | Once a second Vercel-deployed app exists in this repo, or once CI build time on the single app becomes a real pain point |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| GSAP, anime.js, Remotion, Lottie | Duplicates Motion 13 (already installed) and fragments the single reduced-motion code path in `apps/web/lib/motion.ts`; Remotion specifically renders video files, wrong tool for an interactive scrub timeline | Motion 13's `useAnimate`/`animate()` |
| shadcn/ui, Headless UI, Ariakit, MUI, Chakra UI, Mantine | Full styled or opinionated component kits — conflict with the bespoke declassified-dossier visual redesign and duplicate what 3 Radix primitives + existing Tailwind v4 tokens already cover | `radix-ui` (Popover/Dialog/Tooltip only) + hand-written Tailwind classes |
| Floating UI (direct dependency) | Already wrapped internally by Radix's Popover/Tooltip | `radix-ui` |
| Raster grain/paper-texture image files (PNG/JPG assets) | Adds network requests and asset-pipeline weight for an effect a ~400-byte inlined SVG data URI achieves with zero requests | Inlined `feTurbulence` SVG data URI as a static `background-image` |
| A live/animated CSS `filter: url(#turbulence)` on any re-rendering or animating element | Per-pixel GPU cost re-evaluated on every composite; expensive exactly where the board (re-renders every round) and replay (animates every round) can least afford it | Static, pre-rasterized data-URI background-image on a non-re-rendering wrapper element |
| A second/third display typeface beyond Special Elite for "stamp" text | Fragments the type system; one distressed display face plus one clean monospace body face is the whole system the redesign brief calls for | Special Elite (display/stamps only, 16px+) + Courier Prime (body/UI) |
| Turborepo, adopted solely to get `turbo-ignore` | Real dependency + `turbo.json` to maintain for what is currently a single-Vercel-project monorepo | A plain `git diff` Ignored Build Step command |
| A Zod schema (or standalone linter) for `MapDefinition` | TypeScript's structural types plus the existing/soon-to-exist Vitest map-invariant tests already catch the authoring mistakes that matter for two more hand-written map files | TypeScript types + one new `map-invariants.test.ts` |
| `next/font/local` for Courier Prime / Special Elite | Both are already on Google Fonts; manually vendoring their files duplicates what `next/font/google` already self-hosts automatically | `next/font/google` |
| A dropdown/`<select>`-based target picker for in-match actions | Regresses the board's core spatial interaction (click a node on the map) | Keep target selection as direct SVG node-click, unrelated to the new primitives library |

## Stack Patterns by Variant

**If the team decides mid-build that Radix's unstyled `data-state` styling model feels heavier than expected:**
- Fall back to `@base-ui-components/react` (near drop-in for the three primitives used here) rather than reaching for a styled kit — it doesn't change the "unstyled, Tailwind-native" posture this research settled on.

**If a future phase needs true delta-sync or a second live document (beyond the existing `PlayerView` snapshot model):**
- That's out of scope for this research; no state-management change is implied by anything in v1.1 — Zustand already covers spectator mode and replay-scrub UI state as new slices of the existing store, per `apps/web/lib/CLAUDE.md`'s existing store-ownership rules.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `radix-ui@1.6.7` | React 19.2.0, Next.js 15.5.23 | Radix's primitives are React-version-agnostic at this range; no known React 19 compatibility issues found in research |
| `next/font/google` | Next.js 15.5.23 (already installed) | No version action needed — this is a built-in Next.js API, not a separate package |
| Motion `13.1.0` (installed) | React 19.2.0 | `useAnimate`/`animate()` API used for the replay timeline is present at this version; no bump required. Optional low-risk bump to `13.1.1` picks up React 19 strict-mode `AnimatePresence` fixes unrelated to this feature |
| `transpilePackages` config | Next.js 15.x, workspace packages with `"main": "./src/index.ts"` (no build step) | Required whenever a Next app consumes a pnpm workspace package that ships raw TS source rather than a compiled `dist/` — true for both `@berlin/shared` and `@berlin/engine` today |
| Root `packageManager: pnpm@9.15.4` | Vercel's Corepack-based package manager detection | Already present and correct; no change needed for the deploy |

## Sources

- [next.js.org — Getting Started: Fonts](https://nextjs.org/docs/app/getting-started/fonts) — `next/font/google` self-hosting behavior, MEDIUM confidence (official docs)
- [Special Elite — Google Fonts](https://fonts.google.com/specimen/Special+Elite) and [Courier Prime — Google Fonts](https://fonts.google.com/specimen/Courier+Prime) — typeface identity, weight availability, OFL licensing class, MEDIUM confidence (official font pages, cross-checked with the Courier Prime GitHub repo/Quote-Unquote Apps license statement)
- [Base UI — Quick start](https://base-ui.com/react/overview/quick-start) and [Releases](https://base-ui.com/react/overview/releases) — Base UI v1.0.0 stable Dec 2025, Tailwind-native positioning, MEDIUM confidence (official docs)
- [Radix Primitives — Getting started](https://www.radix-ui.com/primitives/docs/overview/getting-started) and the `radix-ui` npm package page — unified tree-shakable package, v1.6.7, MEDIUM confidence (official docs + npm registry)
- [Vercel — Using Monorepos](https://vercel.com/docs/monorepos) and [Configuring a Build](https://vercel.com/docs/builds/configure-a-build) — Root Directory, "include source files outside Root Directory," Corepack/`packageManager` detection, MEDIUM confidence (official docs)
- [Vercel — Framework environment variables](https://vercel.com/docs/environment-variables/framework-environment-variables) — `NEXT_PUBLIC_*` build-time inlining and per-environment scoping, MEDIUM confidence (official docs)
- [Motion — React Animation](https://motion.dev/docs/react-animation) and [Motion — Changelog](https://motion.dev/changelog?lib=motion) — `useAnimate`/scrub/sequencing API and 13.x version history, MEDIUM confidence (official docs + changelog)
- [Codrops — SVG Filter Effects: Creating Texture with feTurbulence](https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/), [freeCodeCamp — Grainy CSS Backgrounds Using SVG Filters](https://www.freecodecamp.org/news/grainy-css-backgrounds-using-svg-filters/), [ibelick — Creating grainy backgrounds with CSS](https://ibelick.com/blog/create-grainy-backgrounds-with-css) — inlined data-URI grain pattern and its GPU-cost tradeoff vs. a live filter, MEDIUM confidence (three independent write-ups agreeing on the same pattern and the same performance caveat)
- Direct repo inspection (this research): `packages/shared/package.json`, `packages/engine/package.json` (confirmed `"main": "./src/index.ts"`, no build step — the basis for the `transpilePackages` finding), `apps/web/next.config.ts` (confirmed `transpilePackages` is currently absent), `packages/engine/src/content/maps/duel12.ts` (confirmed the existing map-as-data pattern), root `package.json` (confirmed `packageManager` present, `engines` absent, no `turbo.json` in the repo) — HIGH confidence, primary source

---
*Stack research for: Berlin 1988 v1.1 "Gameplay and UI Refinement"*
*Researched: 2026-09-14*
