# DI Authentication MFE

A standalone Next.js authentication application combining a React UI and a backend
for frontend (BFF) in one build and runtime. It provides a compact inline
authentication experience with configurable REST endpoints, browser-bound
authentication contexts, and session-cookie handling.

## Features

- Email identification, password sign-in, and email/SMS MFA.
- Explicit passkey sign-in and conditional passkey autofill where supported.
- Registration with email verification, password or passkey enrollment, optional
  phone verification, and consent.
- Session inspection, cookie logout, and cancellation of unfinished attempts.
- Registered-origin framing, CSRF protection, context expiry, replay protection,
  and Redis storage for production authentication.

## Application architecture

| Layer | Responsibility |
| --- | --- |
| React features | Screens, forms, validation feedback, and authentication state |
| Next.js API routes | HTTP entry points for authentication operations |
| Server orchestration | Client policies, context transitions, locking, and session delivery |
| REST adapters | Requests to configured authentication and configuration endpoints |
| Proxy and security helpers | Response headers, framing rules, request checks, and cookie policy |

The UI and BFF are built and run together. Credential verification and signed
session issuance use configured REST APIs; the BFF validates their responses and
sets the browser session cookie.

## Prerequisites

- Node.js 24 is the recommended development version. The installed Next.js package
  requires Node.js 20.9 or newer; the selected pnpm version must also support your
  Node.js version.
- pnpm **12.15.0**, as declared in `package.json`.

The application uses Next.js App Router, React, TypeScript, Tailwind CSS 4,
Base UI shadcn components, React Query, XState, Zod, `jose`, and the `redis` client.

## Local development

From this repository's root:

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

The default application origin is `http://localhost:3000`. Keep `.env.local` out of
Git and adjust values from the [environment template](.env.example) for your
environment. Installation, build, and startup are managed from this repository.

Direct navigation intentionally displays the approved-origin launch screen.
Authentication requires the application's validated embedding initialization;
starting the server does not bypass this security rule. There is one compact
experience, with no presentation-mode query parameter.

Check process liveness:

```bash
curl http://localhost:3000/api/health
```

```json
{"status":"ok","service":"identity-bff"}
```

Health checks do not require a REST or Redis connection. This endpoint reports
application liveness, not dependency readiness.

## Configuration

All settings below are server-side. Do not expose subscriber credentials or
session tokens through `NEXT_PUBLIC_*` variables.

| Variable | Purpose |
| --- | --- |
| `IDENTITY_ORIGIN` | Exact application origin, including scheme and port; development default `http://localhost:3000` |
| `IAM_API_URL` | Authentication REST base URL |
| `CLIENT_CONFIGURATION_URL` | Client-configuration REST base URL; falls back to `IAM_API_URL` |
| `SUBSCRIBER_ID`, `SUBSCRIBER_SECRET` | Service credentials for subscriber-token acquisition; production must supply them |
| `IAM_ISSUER` | Expected session-token issuer; falls back to the authentication API URL |
| `IAM_JWKS_URL` | Signature-verification keys; defaults to the authentication API URL plus `/.well-known/jwks.json` |
| `SESSION_COOKIE_NAME` | Cookie identity; default `iam_poc_session` |
| `SESSION_COOKIE_DOMAIN` | Blank for localhost; an allowed parent domain such as `example.com` for domain-scoped sessions |
| `SESSION_COOKIE_SAME_SITE` | `lax` by default; `none` requires Secure cookies |
| `COOKIE_SECURE` | `false` for local HTTP development; production requires Secure cookies |
| `TRANSACTION_STORE` | `memory` for one local development process; production authentication requires `redis` |
| `REDIS_URL` | Redis connection URL; development default `redis://localhost:6379` |

Allowed parent origins and authentication policies are retrieved through the
configuration adapter, not accepted from a browser-provided origin parameter.
Configurations are cached for at most 30 seconds; an expired configuration is not
reused after a failed refresh. Policy revocation has a bounded cache window.

In-memory contexts disappear when the application restarts and are not shared
between processes. Production contexts, replay protection, and locks require a
protected shared Redis instance.

## Authentication lifecycle

1. Initialization reads a registered `clientId` and a fresh correlation `state`
   from the URL. The page must be running in its permitted embedding context.
2. The proxy derives `frame-ancestors` from validated client configuration.
3. Bootstrap validates configuration and establishes host-only browser-binding
   and CSRF cookies.
4. The UI emits `IAM_AUTH_READY` and waits for `IAM_AUTH_CONFIRM`, validating
   message origin, source window, version, and matching `state`.
5. The BFF creates an authentication attempt and returns an opaque `contextId`.
   Its internal `gatewayContextId` stays server-side.
6. Identification selects password sign-in, passkey sign-in, or registration.
   Credential and factor decisions are obtained through the REST adapter.
7. After password and OTP verification, IAM can offer passkey enrollment to an
   account without a passkey when the registered client permits passkeys. The
   user can add a passkey to the existing account or choose **Skip for now**.
8. Once IAM authorizes session issuance, the BFF verifies the session JWT and
   delivers it through the configured HttpOnly cookie. Adding a passkey keeps
   the password and OTP assurance for this sign-in.
9. The UI emits `IAM_AUTH_COMPLETE`. Resize and cancellation notifications use
   `IAM_AUTH_RESIZE` and `IAM_AUTH_CANCELLED`.

Browser messages use `version: 1` and the original `state`. Completion may include
`accountCreated: true`; resize includes a height. Notifications contain no session
tokens and do not themselves establish an authenticated session. See
[embedding initialization](src/features/host-bridge/initialize-context.ts) and
[AuthExperience](src/features/authentication-flow/auth-experience.tsx).

The REST adapter opts in to the enrollment offer with `offerPasskey: true`
on MFA verification when client policy permits passkeys. IAM returns
`OFFER_PASSKEY` for eligible accounts. Under that gateway context,
`passkey/enrollment/options` returns public creation options and
`passkey/enrollment/verify` or `passkey/enrollment/skip` advances the
context to `ISSUE_SESSION`. Accounts with both sign-in methods can choose
**Sign in with a passkey** from the password step.

The browser sends a fresh `completionId` with the enrollment choice. If the
response is interrupted, **Retry sign-in** sends that ID and the original
`contextId` to the completion route. Recovery requires the original browser
binding, Origin and CSRF checks. Its window is at most 60 seconds and ends
when the context expires. The retry reuses the IAM session idempotency key
and never replays the passkey attestation. Recovery is available while the
original iframe remains open.

Passkey operations use the browser's native WebAuthn APIs. They require a secure
context or localhost, a matching relying-party ID and application origin, and
delegation of `publickey-credentials-get` and `publickey-credentials-create` when
embedded. Browser/OS prompts are native.

## BFF endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Backend-independent liveness |
| GET | `/api/auth/bootstrap?clientId=...` | Client configuration and browser/CSRF cookie initialization |
| POST | `/api/auth/contexts` | Create a browser-bound attempt using `clientId` and `state` |
| POST | `/api/auth/password` | Verify password through the authentication API and create the initial MFA challenge |
| POST | `/api/auth/mfa/challenge` | Resend/create a challenge or switch permitted delivery method |
| POST | `/api/auth/mfa/verify` | Verify OTP and complete sign-in or return `OFFER_PASSKEY` |
| POST | `/api/auth/passkey/enrollment/options` | Prepare a passkey for the existing account after password and OTP |
| POST | `/api/auth/passkey/enrollment/verify` | Verify and save the passkey, then issue the session |
| POST | `/api/auth/passkey/enrollment/skip` | Decline the offer and issue the session |
| POST | `/api/auth/passkey/enrollment/resume` | Finish session delivery for the same enrollment attempt and browser |
| POST | `/api/auth/passkey/options` | Prepare passkey sign-in |
| POST | `/api/auth/passkey/verify` | Verify passkey sign-in through the authentication API and issue the session |
| POST | `/api/auth/registration/identify` | Select existing-user login or begin registration |
| POST | `/api/auth/registration/verify-email` | Verify registration email |
| POST | `/api/auth/registration/resend` | Resend the active registration verification code |
| POST | `/api/auth/registration/profile` | Save pending profile and selected sign-in method |
| POST | `/api/auth/registration/passkey-options` | Prepare passkey enrollment |
| POST | `/api/auth/registration/passkey-verify` | Verify enrollment through the authentication API |
| POST | `/api/auth/registration/verify-phone` | Verify the optional phone number |
| POST | `/api/auth/registration/skip-phone` | Skip optional phone verification |
| POST | `/api/auth/registration/complete` | Complete account creation and issue the session |
| GET | `/api/auth/session?clientId=...` | Inspect an existing session cookie |
| POST | `/api/auth/logout` | Expire the configured session cookie |
| POST | `/api/auth/cancel` | Cancel an unfinished authentication context |

All POSTs require the exact MFE `Origin` and a matching `x-csrf-token` header and
CSRF cookie. Context operations additionally require `contextId` and the bound
HttpOnly browser cookie. Logout does not require an active context. Bootstrap
initializes technical cookies without starting authentication; session inspection
and health checks do not require CSRF tokens.

## Security boundaries

- Credential/factor verification and signed-session issuance are authoritative REST
  operations. BFF request-shape validation and orchestration do not replace them.
- The BFF validates session signature, issuer, client audience, expiry, required
  claims, token type, and authentication assurance before setting the cookie.
  Session inspection applies the corresponding checks.
- Browser-visible IDs cannot replace cookies, CSRF, policy checks, or completed
  factors. Context operations run under locks with expiry and allowed-stage checks.
- Only the session cookie uses the configurable domain. Browser-binding and CSRF
  cookies remain host-only. Cookie deletion uses the same name/domain/path as
  creation. Cookie logout does not implement server-side JWT revocation.
- [Proxy](src/proxy.ts) applies the [header policy](src/server/security/headers.ts).
  Page framing uses the registered exact origin and fails closed when configuration
  cannot be validated. Assets do not trigger configuration lookups. Authentication
  responses use `Cache-Control: no-store`.
- `clientId` is public registration identity. Framing and browser-message checks
  are not a signed launch proof and do not replace request or factor validation.

Never commit real environment files or log passwords, OTPs, subscriber secrets,
service tokens, session JWTs, or raw credential payloads.

## Repository layout

```text
src/
  app/                  Next.js pages, provider wiring, globals, explicit API routes
  components/ui/        Base UI shadcn primitives
  components/auth/      Shared authentication presentation wrappers
  features/             Login, MFA, registration, passkeys, controller, embedding protocol
  lib/                  Shared browser-safe utilities and class-name merging
  server/auth/          Context storage, registration orchestration, session handling
  server/clients/       Client-configuration retrieval and policy validation
  server/infrastructure/ the authentication API REST adapter and Redis connection
  server/security/      Request checks, cookie settings, response-header policy
  server/http.ts        Safe errors and locked context helpers
  styles/theme.css      Authentication-specific Tailwind tokens
  proxy.ts              Response-header and framing integration
```

Shared shadcn theme values live in `src/app/globals.css`. Authentication tokens
live in `src/styles/theme.css`; register custom merge scales in `src/lib/utils.ts`
when needed. Preserve the Base UI setup and native form semantics when editing
authentication wrappers.

## Development and verification

| Command | Behavior |
| --- | --- |
| `pnpm dev` | Start the local HTTP development server |
| `pnpm build` | Run the default `next build` |
| `pnpm start` | Run the default `next start` after building |
| `pnpm lint` | Run Biome checks without fixing files |
| `pnpm format` | Format the project; writes files |
| `pnpm test:e2e` | Run the Chromium end-to-end suite headlessly |
| `pnpm test:e2e:headed` | Watch the automated suite in Chromium |
| `pnpm test:e2e:manual` | Open the chat and drive the sign-in flow yourself |

Generate route types and check TypeScript explicitly:

```bash
pnpm exec next typegen
pnpm exec tsc --noEmit --incremental false
```

Prefer scoped checks/formatting while working on a focused change:

```bash
pnpm exec biome check src/app/api/health/route.ts
pnpm exec biome check --write src/app/api/health/route.ts
```

### Browser tests

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

To drive the flow yourself, run `pnpm test:e2e:manual`. The chat waits for
you to click **Sign in or create an account**. Enter
`playwright@example.test`, password `FixturePassword1!`, and email
verification code `381649` for password sign-in. MFA codes expire after
60 seconds in the fixture. Each MFA resend replaces the previous code and
increments the test value, starting with `381650` for the first resend.
Registration email verification uses `381649`. After password and OTP,
choose **Add a Passkey** or **Skip for now** on the **Protect your account**
screen. Run `pnpm test:e2e:headed passkey.spec.ts` to watch both choices.

To try passkey registration, use a fresh test email such as `passkey-demo@example.test`
and verify it with `381649`. Enter a name, leave Passkey selected, and continue
to open the native prompt. Complete the account form, log out using the header
arrow, then sign in again with the same email and passkey. Manual mode uses the
browser's own authenticator prompt, which requires a platform authenticator or
security key. The fixture stores account data in memory for the current run, so
use a fresh test email in later runs if your device retains the old credential.
Close the Chromium tab to end the preview.

To watch Playwright drive the flow, run `pnpm test:e2e:headed`.
Use Playwright Inspector to step through a single test at your own pace.

```bash
pnpm test:e2e:headed --debug -g 'signs in inline'
```

The suite starts its own Next.js development server, React chat fixture, and
mock REST API. The fixture uses the shared Tailwind theme and shadcn primitives.
Use Node.js 24 as above to run the fixture build. The suite uses loopback ports
and in-memory context storage. Stop any Next.js development server running
from this checkout before starting the suite.

The chat loads the authentication iframe only after the sign-in button is
clicked. The fixture checks server readiness over TCP so it does not warm up
any MFE HTTP routes. Automated coverage includes the following flows.

| Area | Scenarios |
| --- | --- |
| Password and MFA | Sign-in, incorrect-password recovery, invalid OTP, resend countdown, replacement-code rejection, expired-code rejection, and recovery |
| Registration | Password and passkey enrollment, then sign-in with the created credential |
| Passkeys | Existing-account enrollment and skip after password and OTP, later sign-in with either method, and rejection of an altered assertion |
| Context security | Missing or incorrect CSRF/Origin, another browser's context, missing browser-binding cookie, reused state, premature MFA, and unknown, expired, cancelled, or completed contexts |
| Chat and session | Launch on click, blocked framing, direct-navigation rejection, cancellation, session recognition after reload, and logout |

The recovery tests advance the browser clock for the resend countdown and use
controls inside the mock to expire MFA challenges. Authentication context expiry
is checked through the real BFF routes. These controls are local test fixtures.

Run individual groups using the same headed or headless commands.

```bash
pnpm test:e2e recovery.spec.ts
pnpm test:e2e context-security.spec.ts
pnpm test:e2e:headed registration.spec.ts
```

The browser verifies cookie delivery between two loopback origins.
Production parent-domain cookie behavior requires an HTTPS subdomain test.

For authentication changes, verify a successful flow and relevant rejection paths,
including CSRF/origin, browser binding, expiry, policy, replay, and concurrency.
Update the documented REST, cookie, and browser-message interfaces when behavior
changes.

### Production-mode build and start

`next build` and `next start` use production mode. The development `.env.local`
template sets an HTTP origin and `COOKIE_SECURE=false`, which conflict with the
application's production cookie rules. Supply compatible environment overrides
before building or starting. For a local production-build check on macOS/Linux:

```bash
COOKIE_SECURE=true \
IDENTITY_ORIGIN=https://auth.example.com \
pnpm build

COOKIE_SECURE=true \
IDENTITY_ORIGIN=https://auth.example.com \
pnpm start
```

These example values allow production-mode validation; they do not configure TLS
or REST connectivity. Health can be checked locally. Production authentication
also requires HTTPS, registered matching origins, explicit service credentials,
compatible issuer/JWKS settings, Redis, and valid cookie scope. Use `pnpm dev` for
normal local HTTP development.

Builds do not require live REST or Redis connections. Dependency installation and
uncached `next/font/google` font downloads may require network access.

## Troubleshooting and current limits

| Symptom | Check |
| --- | --- |
| Direct URL shows the launch screen | Expected; validated embedding initialization is required |
| Page framing is blocked | Registered exact parent origin and response `frame-ancestors` policy |
| Initialization is rejected or times out | Message origin/source/version/state, client configuration, REST connectivity |
| POST returns 403 | Exact `IDENTITY_ORIGIN`, cookies, and matching CSRF header |
| Attempt expires or cannot resume after restart | Start a fresh attempt; memory contexts are process-local |
| Passkey prompt fails | Secure context/localhost, matching RP ID and application origin, WebAuthn delegation, credential state |
| Build/start rejects cookie settings | Remove development-only production conflicts or supply compatible overrides |

Google sign-in and password reset are visible placeholders and are not connected.
The current protocol is shared-cookie inline authentication; OIDC/SAML callback
completion is not implemented. OpenAPI documentation, Docker, and CI configuration
are not currently included.

Read [AGENTS.md](AGENTS.md) before changing architecture, security controls, or
framework conventions. Update this README when commands, settings, interfaces,
or application capabilities change.
