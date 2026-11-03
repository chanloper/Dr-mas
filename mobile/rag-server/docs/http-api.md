# Authenticated local evidence API

HTTP mode currently performs local search and returns source quotations, not
Gemini-generated explanations. It never constructs a Gemini client. Only corpus
documents explicitly marked `permitted` are eligible; pending MFDS and synthetic
test-only documents are excluded. Do not put patient-specific documents into this
shared public corpus. Source permissions require operator review, not an API flag.

Set server-only SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in rag-server/.env.
The URL must identify the intended project's HTTPS Auth service. No service_role
key or database password is needed. Node loadEnvFile preserves existing process
environment values; restart after private configuration changes. Nothing from
this file is added to the mobile bundle. GEMINI_API_KEY is unused in HTTP mode.

After configuring, `npm run serve` starts on 127.0.0.1:8787. This document does not
authorize remote tests. Set RAG_HOST to the development LAN interface for device
testing; use TLS when crossing an untrusted network. Set RAG_ALLOWED_ORIGINS to
comma-separated exact web origins for Expo web; no wildcard is accepted by the
handler. Native requests without an Origin still require a verified bearer token.
The server trusts the socket peer, never X-Forwarded-For. Put public deployments
behind TLS and a reviewed gateway; distributed quotas are not implemented.

POST /api/rag/chat accepts only `{ "question": "a general nonpersonal question" }`.
Authorization is verified against Supabase /auth/v1/user, not by decoding JWTs.
All authenticated, non-anonymous users receive the same rights-reviewed public
corpus. Body user IDs, corpus paths and permission flags are rejected. No DB
queries, patient records, conversation history, or question logging is involved.

Limits: 8192 body bytes, 2000 question characters, 10 requests per user per minute,
60 per socket peer per minute, 10000 active rate keys and 10-second deadline.
An in-flight local read cannot be cancelled, but its late result is discarded.
Errors are static codes: 400 INVALID_INPUT, 401 UNAUTHORIZED, 403 ORIGIN_DENIED,
413 BODY_TOO_LARGE, 415 JSON_REQUIRED, 429 RATE_LIMITED, 503 AUTH_UNAVAILABLE,
504 TIMEOUT, 500 SERVER_ERROR. Responses are no-store and carry the disclaimer.

Mobile configuration: set ONLY EXPO_PUBLIC_RAG_API_URL to the server origin,
without a path, credentials or query. Production requires HTTPS. Development
HTTP is restricted to loopback/private IPv4 hosts (Android emulator: 10.0.2.2).
Reload the Expo bundle after changing the address. Never use EXPO_PUBLIC for a
Gemini key. No configuration files or secrets are automatically copied.

The mobile client reads the current Supabase token, sends only the question,
does not retry, and distinguishes login/network/timeout/server/rate-limit errors.
Session changes suppress late replies. A future Gemini mode needs separate
approval, privacy/consent design, corpus permission review and durable cost limits;
this HTTP route intentionally has no switch enabling external AI transmission.
