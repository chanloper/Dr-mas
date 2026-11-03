# Device connection verification

2026-11-03 (Asia/Seoul): PASS, based on the operator's observed device test.

- The server emitted HTTP 200 and response type insufficient_evidence.
- The operator confirmed the matching insufficient-evidence message on the phone.
- This verifies mobile -> authenticated RAG route -> Supabase Auth verification
  -> mobile response display for that run. No JWT, identity, IP, question, response
  body, or key is retained in this record.
- This does not validate medical accuracy, populated-corpus retrieval, Gemini
  generation, patient/guardian database RLS, or production deployment.

The one-shot observer exhausted itself after the response. Runtime wiring of
RAG_OBSERVE_ONCE has now been removed; new server starts ignore that old flag.
No additional device or live Auth test is needed for this milestone.

## Registered MFDS document device test

2026-11-03 (Asia/Seoul): PASS, based on the operator's reported phone test.

- Document: mfds-easy-195700020, version 1.
- Evidence chunk: mfds-easy-195700020:1:0.
- The phone displayed the registered official document's local search result.
- Provider, dataset name, item code, source update date, use conditions and the
  official dataset link were visible. The link was not represented as a verified
  product-detail page.
- The operator confirmed precaution and storage sections were displayed. Their
  text is intentionally not reproduced in this record.
- Local search and quotation were approved for this one document only. External
  embedding and generation remain denied. No new live test was performed while
  recording this result.
- The source snapshots and the destination's four scoped review records remain
  private local data, excluded from Git. This milestone does not establish
  clinical accuracy, approval of other documents, or production readiness.
