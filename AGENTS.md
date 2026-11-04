# DI Authentication MFE — Repository Instructions

## Application scope

- This is a standalone React UI + Next.js BFF, built and run as one application.
- Preserve its REST, browser-message, and cookie interfaces. Keep source imports,
  build configuration, and startup independent of cross-repository source code.
- Keep README and repository instructions specific to this application. Do not add
  other application names, checkout locations, startup commands, or orchestration
  instructions. Describe only this application's setup, configuration, and interfaces.
- Treat this repository's current framework setup as authoritative. Preserve App
  Router, Cache Components, Partial Prefetching, React Compiler, Turbopack Tailwind,
  Base UI shadcn, and Biome unless the requested change concerns those settings.
- Make scoped changes, preserve unrelated work, and keep commands/documentation
  consistent with the actual `package.json`. Follow discussion-only requests without
  editing files. Do not commit or publish unless requested.

## Architecture and organization

- Keep `src/app` entry points small. Use explicit API route files with fixed
  operations; shared registration logic belongs in `src/server/auth/registration.ts`.
- Put browser behavior in `src/features`, authentication presentation in
  `src/components/auth`, generated Base UI primitives in `src/components/ui`, and
  BFF behavior in `src/server`. Keep server-only modules out of browser imports.
- Keep the single compact inline experience and direct-navigation approved-origin
  launch screen. Do not introduce an `embedded=1` mode or bypass embedding
  initialization for development. Existing legacy-parameter cleanup is not a second
  experience.
- Keep HTTP contracts stable. Coordinate deliberate REST, cookie, and message
  changes with the documented REST/browser-message interfaces and update
  documentation alongside code.
- Keep `/api/health` a backend-independent liveness endpoint. It must not require
  authentication APIs, client configuration, Redis, subscriber credentials, or
  browser cookies.

## Authentication authority and sensitive data

- Configured authentication REST APIs provide authoritative credential and session
  decisions. Validate request shape in the BFF; use the APIs for password/OTP
  validity, WebAuthn attestation/assertion validity, account requirements, and
  session issuance.
- The browser-facing `contextId` is the opaque BFF-generated GUID. Keep
  `gatewayContextId`, MFA challenge IDs, service credentials, and service tokens
  server-side. WebAuthn public challenges/options are intentionally browser-facing.
- Never log passwords, OTPs, subscriber secrets, service tokens, session JWTs, raw
  credential payloads, or environment/connection strings that can contain secrets.
  Return safe public errors instead of upstream exception details.
- Do not return session JWTs in JSON or postMessage payloads or store them in
  browser storage. Keep service credentials out of `NEXT_PUBLIC_*` variables.
- Preserve registered policy checks. Identification must still support existing-user
  login when registration is disabled. New-account requests must respect the
  registration policy, and subsequent registration operations must enforce
  `registrationEnabled` in the BFF too.

## Request and context security

- Every POST requires exact MFE Origin validation and double-submit CSRF validation.
  Reuse `requireCsrf()` and the existing timing-safe comparison. Do not broaden CORS
  to make an integration pass. Bootstrap GET only establishes technical cookies;
  it does not create an authentication context or authenticate a user.
- Context operations must use `withContext()` so locking encloses context loading,
  validation, the authentication API calls, and updates. Preserve browser-cookie binding, absolute
  expiry, allowed-stage checks, registered-origin checks, and policy-version checks.
- Preserve one-time consumption of the browser/client/state combination and existing
  operation-specific idempotency keys. Do not invent new retry behavior without
  checking the authentication API's contract and the context state transitions.
- Production authentication requires Redis. Keep atomic state consumption and
  owner-checked lock release; do not fall back to memory after Redis failures.
- Do not trust browser-provided factor completion, gateway IDs, policy, or origins.
  Preserve API confirmation checks before advancing factors or issuing sessions.
- Expired, cancelled, and completed BFF contexts must not continue authentication.
  Cancellation stops an unfinished attempt and must not clear an existing session.

## Session and cookie contract

- The authentication API signs/authorizes the session; the BFF validates and
  delivers its cookie. Reuse the session-issuance helper for password/MFA, passkey,
  and registration flows.
- Verify the session signature, `RS256` algorithm, issuer, client audience, expiry,
  required `exp`/`sub`, `token_use: session`, and authentication assurance. Accept
  password + OTP, or passkey (`fido`) + user verification (`uv`) / OTP. Session
  inspection must enforce the corresponding checks.
- Only the session cookie uses the configurable shared parent domain. Keep it
  HttpOnly, with path `/`, configured SameSite, and Secure in production. Keep
  browser-binding and CSRF cookies host-only and retain their current accessibility.
- Cookie deletion must use the same name, domain, and path as creation. Logout
  requires CSRF but not a live authentication context. It currently clears the
  browser cookie; it does not implement JWT revocation.

## Framing and browser messages

- Reuse `src/server/security/headers.ts` from `src/proxy.ts`. Preserve baseline
  headers, authentication `no-store`, and configuration-derived `frame-ancestors`.
  Keep framework/build settings in `next.config.ts`; do not duplicate framing policy
  there. Existing route-level `no-store` responses can remain.
- Only `/` performs the proxy's client-configuration lookup. Preserve fail-closed
  framing when configuration is unusable. Never reuse an expired security policy
  after a configuration-service failure. Assets must not trigger those lookups.
- Validate message origin, source window, version, and pending `state`. Use exact
  postMessage target origins. Completion/cancellation messages carry correlation
  notifications, not authentication proof or tokens. A completion message alone must
  never authorize a session.
- `clientId` is public client identity. CSP and browser messaging do not provide
  cryptographic caller authentication; do not document them as a signed launch
  ticket. Preserve both iframe WebAuthn delegation features.

## UI and styling

- Use authentication wrappers over the existing Base UI shadcn primitives. Preserve
  forwarded refs, labels, unique IDs, accessibility feedback, and native form names,
  values, radio/checkbox behavior, and FormData semantics.
- Keep shared shadcn values in `src/app/globals.css` and authentication tokens in
  `src/styles/theme.css`. Register custom merge scales in `src/lib/utils.ts` when
  necessary. Use semantic Tailwind tokens for repeated design values.
- Preserve the current design and flow during refactors. Keep passkey as the
  default registration option when policy permits it. Native passkey prompts belong
  to the browser/OS. Keep the Google/reset placeholders unless their implementation
  is explicitly in scope.

## Verification and handoff

- Read the relevant installed Next.js guide before changing framework behavior;
  see the generated guidance below.
- After TypeScript changes, generate route types and run:
  `pnpm exec next typegen`, then `pnpm exec tsc --noEmit --incremental false`.
  Generated development types may need regeneration after route moves; do not
  hand-edit `.next` files or weaken TypeScript to hide stale route references.
- Run `pnpm exec biome check <changed-files>` for touched files and `pnpm build`
  after application changes. Production build/start must use compatible cookie and
  HTTPS-origin settings; see README for local overrides. Keep actual services
  unnecessary for build and liveness checks.
- For authentication changes, exercise success and relevant rejection paths:
  invalid credentials/factors, origin/CSRF, browser binding, expiry, policy, replay,
  and concurrency. Verify shared-cookie scope and cancellation/logout distinctions
  when those behaviors change. Use controlled REST fixtures and distinguish fixture
  results from native browser/WebAuthn verification.
- No test runner, test scripts, or persistent suite is currently checked in. Do not
  claim `pnpm test` or `pnpm test:production` exists. When adding tests, place them
  under root-level `tests/`, beside `src/`, with independent REST fixtures. Temporary
  verification harnesses are not repository-owned test coverage.
- For documentation-only work, check commands, links, API names, settings, and
  consistency with source; a production build is not required just for Markdown.
- Stop task-created servers/browser instances. Report what changed, validation,
  and remaining limitations. Update README when commands or integration behavior
  change. Preserve the generated Next.js guidance below.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
