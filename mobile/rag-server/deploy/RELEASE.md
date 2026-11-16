# Existing Render service deployment gate

No operating database writes or deployment have been performed.

1. After explicit approval, apply only `supabase/proposals/202611160001_rag_kdca_controls.NOT-APPLIED.sql` and then `202611160002_rag_kdca_initial_control.NOT-APPLIED.sql` to the existing Supabase project using its SQL editor. These create one independent metadata table and its stop-only trigger. No user, medication or SOS tables change. Initial activation is bound to the existing approved snapshot, raw hash, content hash and document version. It never overwrites an existing row and fails if it encounters a revoked/mismatched record. Service keys cannot insert new approval records, change approval hashes/verification time or reactivate a stopped row.
2. Upload the already generated `production/rag-state.json` as the existing Render service's secret file named `rag-state.json`. SHA-256: `0ca7ab26c21a48478614926ea35dcdb2974a6c507acb550d91f9a3375266fc64` (43,016 bytes). Keep it out of Git.
3. Apply `render-kdca.env.example` to that same service, keep its existing Supabase auth settings, and privately set `RAG_KDCA_CONTROL_SERVICE_KEY`. Do not change the Vercel URL or the existing webapp's RAG endpoint.
4. Existing service Root Directory: `mobile/rag-server`. Build: `npm ci --include=dev`. Start: `RAG_PORT=$PORT npm run serve`. Preserve any existing required CORS origins when adding the current webapp origin.
5. Push/deploy the reviewed release commit only after approval. Any Git push that triggers automatic deployment counts as production deployment. No webapp/UI rebuild is required if its existing endpoint is still this same Render service.

The initial source verification remains **2026-11-16T09:16:30.378Z**, valid for less than 24 hours (until **2026-11-17T09:16:30.378Z**, 18:16:30 KST). Initial SQL and runtime reject an expired record. Copying/restarting/deploying does not extend this interval. No KDCA API request or verification-time reset was performed for this release.

Each restore and serving read queries Supabase; no cached-active fallback. Missing/failed/expired controls or mismatched approval hashes block KDCA, while existing MFDS data remain available. Revision-checked operator stop persists in Supabase and survives Render free-tier disk resets:

```sh
node node_modules/tsx/dist/cli.mjs src/kdca-control-cli.ts disable 5830 revoked 'ACTUAL OPERATOR NAME'
```

Use `changed_pending_review` instead of `revoked` for a change notice. This is a production DB write and requires the operator's authorization. `KDCA_DURABLE_STOP_FAILED` means the stop was not confirmed; keep KDCA disabled/service stopped until the durable operation is confirmed. Changed content is still handled by the existing quarantine/review/registration procedure; reactivation is an explicitly reviewed owner-level SQL operation, never a runtime automatic upsert.

The existing source cards show the document title/provider and the existing evidence dialog shows the unchanged quotation and official source link. No UI code is changed. No external generation or embedding is enabled. Windows-only source comparison commands are not run on Render; this deployment does not start a source-fetching job.

References: [Render filesystem](https://render.com/docs/disks), [secret files](https://render.com/docs/configure-environment-variables#secret-files), [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api).
