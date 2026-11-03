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

## Isolated synthetic retrieval checks

`npm run synthetic:check` runs fixed in-memory search and source assertions with
zero network calls and prints only a summary. No credentials or .env are needed.

An optional development server mode `RAG_CORPUS_MODE=synthetic` uses that same
isolated corpus instead of reading data/local. It still requires real Auth for
HTTP clients; no authentication bypass exists. Production rejects this mode.
Do not start another live device test without a separate need/approval. No private
.env files are changed by adding this feature. Default mode remains `local`.

The fixed queries are synthetic card markers in Korean:
`합성안내카드알파` and `합성안내카드베타`. Documents contain only fictional color
and shape labels, never drug facts. Titles/disclaimers visibly say synthetic.
example.org URLs are fixture identifiers, not real medical references, and are
never fetched. Sources retain document/chunk IDs, title, quote, publisher and
update date. Mobile renders them inside the existing message bubble.

Synthetic documents retain `test-only` rights. Default HTTP search excludes them;
the isolated mode accepts only matching fixed content hashes. Pending/real corpus
documents cannot enter this mode. No ingestion, persistent store, patient data,
Gemini calls or semantic embeddings are involved. This tests keyword retrieval
and citation display, not medical accuracy or semantic model quality.
