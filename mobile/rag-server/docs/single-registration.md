# Single-document registration (not yet executed on official data)

The reviewed CLI binds only mfds-easy-195700020, version 1, and SHA-256
453bf3c749d2c07a7334a93816a37f52004f9407db0041a0b2c89f4af959fd55.
Source: data/mfds-scale-20/rag. Destination: data/local. Paths are fixed and no
recursive import, network client, .env loader or Gemini call is involved.

`npm run register:reviewed -- dry-run` reads both stores, verifies source ID/version/
hash and pending state, rejects duplicates, and reports document increase 1.
It creates neither the destination directory nor an approval record. Output
contains attribution and fingerprints, never medical text or secrets.

After explicit final user approval, execute using the SAME reviewed fingerprints:

```powershell
npm.cmd run register:reviewed -- execute --approve-single-document `
  --reviewer=APPROVED_REVIEWER_ROLE `
  --destination-fingerprint=DRY_RUN_DESTINATION_FINGERPRINT `
  --source-fingerprint=DRY_RUN_SOURCE_FINGERPRINT
```

The reviewer must be explicitly chosen/approved by the user; placeholders are
not valid attestations. Do not execute this command during development/preparation.
The final timestamp is recorded at execution. Official terms evidence URL, role,
purpose, exact scope, document ID/version/hash are persisted in the two per-scope
review records in the new destination document, atomically with registration.
Legacy permission remains pending; only the explicit local_search and quotation
scopes become permitted. Both external scopes are explicitly denied. No source
document, other pending record, vectors or usage counters are changed.

Existing target documents/chunks are preserved. Changed source metadata, changed
destination, version/hash mismatch, aliases, duplicate documents and repeated
registration fail closed. A lock serializes target writes; source is only read.
The operator must prevent concurrent source replacement during execution. Stored
reviews are operator attestations, not legal advice or cryptographic signatures.

For this candidate, dataset attribution resolves to the official e약은요 dataset
and terms metadata. No product-detail URL is fabricated. Exact quotations and
the standard medical disclaimer appear in the existing mobile message UI. This
does not imply clinical validation or approval to transfer text to external AI.

All registration tests use authored synthetic fixtures and disposable local
repositories. Actual official-data dry-run remains unapproved and read-only.
