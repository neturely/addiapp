# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.9.0] - 2026-07-21
### Changed
- Projects D — project-completion bonus + how projects affect points ([#240](https://github.com/neturely/addiapp/issues/240))
- Projects C — Play-mode "Focus on projects" (Choice third option + auto-selection) ([#238](https://github.com/neturely/addiapp/issues/238))
- Projects B — Dashboard "Unassigned" tab + assign-to-project flow ([#236](https://github.com/neturely/addiapp/issues/236))
- Projects A — schema, CRUD API, and the Dashboard Projects view ([#234](https://github.com/neturely/addiapp/issues/234))

## [1.8.0] - 2026-07-20
### Changed
- Docs sync — EditTask desktop modal + dashboard pagination + test tiers (CLAUDE.md, PROJECT_SPEC.md) ([#228](https://github.com/neturely/addiapp/issues/228))
- EditTask → desktop modal over the dashboard (a11y: focus trap, Escape, role=dialog) ([#218](https://github.com/neturely/addiapp/issues/218))
- TECH-1 Tier 3 — Integration test: task access returns 404 (not 403) for non-owners ([#129](https://github.com/neturely/addiapp/issues/129))
- TECH-1 Tier 2 — Auth/session test coverage (Passwords, Sessions, RateLimit) ([#128](https://github.com/neturely/addiapp/issues/128))
- PERF-1 — Paginate the dashboard task list ("Load more", keyset cursor) ([#100](https://github.com/neturely/addiapp/issues/100))

## [1.7.0] - 2026-07-20
### Changed
- Docs sync — mascot v3 / PlayCard Phase 2 / FormCard now BUILT (CLAUDE.md, PROJECT_SPEC.md) ([#220](https://github.com/neturely/addiapp/issues/220))
- Docs sync — mascot v3 star-character rebuild + PlayCard half-out placement + currency (CLAUDE.md / PROJECT_SPEC.md) ([#215](https://github.com/neturely/addiapp/issues/215))
- Play-moment card Phase 2 (#204 epic): migrate TaskPresented + InProgress onto PlayCard, mascot half-out ([#211](https://github.com/neturely/addiapp/issues/211))
- Play-moment card — Phase 1: build the shared PlayCard skeleton + migrate Completion & EmptyState ([#208](https://github.com/neturely/addiapp/issues/208))
- Settings: change email with re-verification (pending-email + confirm flow) ([#200](https://github.com/neturely/addiapp/issues/200))
### Added
- Rebuild the mascot as the star character (new Mascot.tsx) — supersedes #96 SVG ([#210](https://github.com/neturely/addiapp/issues/210))
- Form template — shared FormCard for AddTask / EditTask / Settings ([#206](https://github.com/neturely/addiapp/issues/206))

## [1.6.0] - 2026-07-19
### Added
- A11Y — convert the AddTask effort picker from aria-pressed to a proper radiogroup ([#197](https://github.com/neturely/addiapp/issues/197))
- Feature: Settings page (/settings) — account management (username, email, password) + header gear entry — scoping… ([#187](https://github.com/neturely/addiapp/issues/187))
- Feature: optional task description field (AddTask/Edit textarea, Dashboard expandable row, TaskPresented) — scoping… ([#184](https://github.com/neturely/addiapp/issues/184))
### Fixed
- Stats page redesign — hero primary card + 2×2 color-identity stat grid (also the mobile fix) ([#185](https://github.com/neturely/addiapp/issues/185))
### Changed
- Drop the Home screen — make Choice the Play-mode landing (/ → Choice) ([#191](https://github.com/neturely/addiapp/issues/191))

## [1.5.0] - 2026-07-18
### Fixed
- Play-loop Choice + empty-state fixes from live playthrough — responsive Choice layout, rotating heading, shared… ([#183](https://github.com/neturely/addiapp/issues/183))
- Play-loop fixes from live playthrough — remove native tooltips, timer chip redesign (pulsing dot), Completion card… ([#181](https://github.com/neturely/addiapp/issues/181))
- Dashboard table fixes from live playthrough — stable inline-edit row height, icon-only actions, "To do" relabel,… ([#178](https://github.com/neturely/addiapp/issues/178))
- AddTask fixes from live playthrough — rotating placeholders, vivid effort picker (new deepened warning token),… ([#176](https://github.com/neturely/addiapp/issues/176))
- Dashboard fixes from live playthrough — empty-state width, Gravatar avatar, banner redesign (green, 3 columns), filter… ([#174](https://github.com/neturely/addiapp/issues/174))

## [1.4.0] - 2026-07-17
### Fixed
- Accessibility across the app — route-change focus + skip link, live-region alerts and loading/undo-toast status (with pause-on-hover), a radiogroup time picker, labelled keyboard-reachable inline editing, and table caption/scope. Mobile-toast announce remains for the mobile dashboard ([#126](https://github.com/neturely/addiapp/issues/126))
### Added
- Persistent in-progress task timer in the header ([#135](https://github.com/neturely/addiapp/issues/135))
### Changed
- Preserve the Puppeteer-core e2e/a11y verification harness in the repo (client/e2e/) ([#170](https://github.com/neturely/addiapp/issues/170))

## [1.3.3] - 2026-07-16
### Changed
- OPS-4 — Nightly cleanup of expired sessions / email_tokens / rate_limits rows ([#109](https://github.com/neturely/addiapp/issues/109))
- OPS-2 — Deploy migration safety: pre-deploy backup + migrate-before-cutover + idempotent-migration discipline ([#103](https://github.com/neturely/addiapp/issues/103))

## [1.3.2] - 2026-07-16
### Changed
- TECH-3 — Lightweight structured logging (replace ad-hoc error_log calls) ([#122](https://github.com/neturely/addiapp/issues/122))
- PERF-3 — Cap oversized request bodies before parsing into memory ([#114](https://github.com/neturely/addiapp/issues/114))
- OPS-3 — Deepen /api/health to verify DB + external uptime monitoring ([#105](https://github.com/neturely/addiapp/issues/105))
### Security
- SEC-2 — Make /register non-enumerating (stop leaking account existence via 409) ([#118](https://github.com/neturely/addiapp/issues/118))

## [1.3.1] - 2026-07-16
### Changed
- ERR-1 — Global 401 handling: silent redirect to /login on session expiry (unify fetch layers, absorbs ERR-2) ([#101](https://github.com/neturely/addiapp/issues/101))
### Added
- ERR-3 — Add ~15s request timeout to the shared fetch layer ([#110](https://github.com/neturely/addiapp/issues/110))
### Fixed
- ERR-4 — Finalize optimistic delete on unmount instead of abandoning it, so a task deleted mid-undo-window isn't left alive server-side ([#112](https://github.com/neturely/addiapp/issues/112))

## [1.3.0] - 2026-07-16
### Added
- Cloudflare Turnstile CAPTCHA on the register and forgot-password forms, verified server-side ([#79](https://github.com/neturely/addiapp/issues/79))
- SEC-1 — Add security response headers (HSTS, nosniff, frame-ancestors, Referrer-Policy) at the origin ([#107](https://github.com/neturely/addiapp/issues/107))
### Changed
- Production email readiness — Resend domain verification ([#65](https://github.com/neturely/addiapp/issues/65))
- App-wide vivid color palette v3 — true-saturation colors + dark-text-on-vivid (semantic token layer) ([#143](https://github.com/neturely/addiapp/issues/143))
- SEC-3 — Loosen per-email login limit so it can't be used to lock out real logins ([#120](https://github.com/neturely/addiapp/issues/120))

## [1.2.0] - 2026-07-15

### Changed

- Visual refresh v2 (A) — design tokens + Header/Footer shell + layout wiring ([#92](https://github.com/neturely/addiapp/issues/92))
- Visual refresh v2 (B) — Batch 1: retrofit Play-loop screens + Mascot to tokens ([#133](https://github.com/neturely/addiapp/issues/133))
- Visual refresh v2 (B) — Batch 2: retrofit Dashboard + PointsCard to tokens ([#137](https://github.com/neturely/addiapp/issues/137))
- Visual refresh v2 (B) — Batch 3: retrofit Forms + Stats to tokens ([#139](https://github.com/neturely/addiapp/issues/139))
- Visual refresh v2 (B) — Batch 4: retrofit Auth pages to tokens (closes #94) ([#141](https://github.com/neturely/addiapp/issues/141))
- Mascot redesign v2 — icon-style, expression-driven (refine the existing single component) ([#96](https://github.com/neturely/addiapp/issues/96))

[Unreleased]: https://github.com/neturely/addiapp/compare/v1.9.0...HEAD
[1.9.0]: https://github.com/neturely/addiapp/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/neturely/addiapp/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/neturely/addiapp/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/neturely/addiapp/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/neturely/addiapp/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/neturely/addiapp/compare/v1.3.3...v1.4.0
[1.3.3]: https://github.com/neturely/addiapp/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/neturely/addiapp/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/neturely/addiapp/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/neturely/addiapp/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/neturely/addiapp/compare/v1.1.0...v1.2.0
