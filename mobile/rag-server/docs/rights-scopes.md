# Document-specific use rights

This change does not approve any saved medical data or create a license. All MFDS
stores remain unchanged and pending. There is no HTTP approval endpoint.

`rights.permission`, terms and checkedAt remain readable legacy metadata.
Neither legacy `permitted` nor a synthetic ID/hash allowlist grants any scope.
Missing scopes or decisions deny access. New decisions are per document:

- local_search: local text matching and result metadata.
- quotation: return source text. Search-only hits redact text; answer/HTTP abstains
  if there is no source with both local_search and quotation.
- external_embedding: send verified document chunks to the embedding provider.
  This is independent of local_search and quotation.
- external_generation: include evidence in the generation prompt. Answer generation
  additionally requires local_search and quotation to produce validated citations.

Each entry in `rights.scopes` has decision pending/denied/permitted. A permitted
entry requires scope (exact key), evidenceUrl (HTTPS), reviewedAt, reviewer,
documentId, documentVersion (positive integer), contentHash (SHA-256 of exact
content), and purpose (reviewed use scope). Invalid or incomplete grants are
rejected by registration. Omitted entries are effectively pending/denied.

Registration binds decisions to the actual next content version and hash. Stale
grants become pending, retaining their review metadata; new content is never
approved by inheritance. Metadata refresh with unchanged content/version can
retain matching reviews. Import without scope decisions removes effective grants.
Search and transfer also verify chunk version, content hash and source offsets.
Denied/revoked rights hide existing vectors; cached vectors do not grant rights.

The legacy field can remain pending while a separately reviewed local scope is
permitted. Only the new scoped review is authoritative. Existing pending documents
with no scoped review remain entirely blocked; old permitted documents also need
explicit reviews before they can be searched or quoted. No automatic migration
or saved-store rewrite is performed.

The CLI, SearchIndex, HTTP local search, reranker, document embedding and answer
generation enforce scopes. Synthetic author fixtures carry explicit limited test
reviews; ordinary HTTP mode still excludes test-only records. Synthetic embedding
also requires the existing exact allowlist in addition to external_embedding.

Question embeddings contain the question, not document text, and still require
the explicit public/nonpersonal-question acknowledgement in CLI live paths.
Generation may use a question embedding without embedding the documents: denying
external_embedding does not deny a separately reviewed external_generation grant.
HTTP remains local-only and constructs no Gemini provider.

Generation rechecks reviews before transmission and before returning citations.
These checks cannot retract an already sent provider request; operators must
serialize permission changes with live jobs when adding an approval workflow.
Stored reviews are trusted operator input, not cryptographic attestations. Restrict
filesystem/import access. A future authenticated reviewer registry/UI must verify
actual licenses, distinguish terms and source changes, and retain a separate
append-only audit log. No automatic approval or deletion of provider-held data is
claimed. External use remains subject to separate operator authorization.
