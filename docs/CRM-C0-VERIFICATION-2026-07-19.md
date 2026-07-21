# CRM C0 — Database Export Verification (2026-07-19)

Continues `CRM-INTEGRATION-PLAN.md` Phase C0. The Lovable database export
(`backups/crm-database-export-2026-07-16.backup`) has now been **test-restored
and verified** — the business's data provably exists, intact, outside Lovable.

## What was verified

The export is a PostgreSQL 17 custom-format archive (written by pg_dump 18.4,
server 17.6, zstd-compressed, 2,119 TOC entries). It was restored into a
scratch PostgreSQL 16 instance in the Cowork cloud sandbox (the archive was
converted 1.16 → 1.15 by stripping the PG17-only `relkind` TOC field —
converter script preserved in the session; the original backup is untouched).

Restore result: **13 restore errors total, all from a single table**
(`ada_memory_embeddings`, which needs the `pgvector` extension unavailable in
the sandbox — its data IS in the dump; nothing is missing from the backup
itself). Everything else restored cleanly: 116 public tables (158 across
public/auth/storage/realtime/supabase_migrations), all constraints, indexes,
325 RLS policies, triggers and functions.

Row counts vs the Lovable dashboard figures recorded on 2026-07-17:

| Table | Dashboard | Restored | Match |
|---|---|---|---|
| public.messages | 1,586 | 1,586 | ✅ |
| public.notifications | 735 | 735 | ✅ |
| public.budget_items | 666 | 666 | ✅ |
| public.tasks | ~595 | 595 | ✅ |
| auth.users | 4 | 4 | ✅ |

Also restored: jobs 282, clients 225, quotes 29, storage.objects metadata 685.
`public.leads` is empty (0 rows) — worth confirming with Ben that leads are
expected to live in `clients`/`jobs` rather than the `leads` table.

## New artifacts (in `backups/`, gitignored like the original)

- `crm-full-plain.sql.gz` — full plain-SQL dump (schema + all data, 161 COPY
  sections, ~10.7 MB gzipped). **Version-agnostic**: restores into any
  Postgres ≥ 15 with plain `psql`, no pg_restore version games. This is the
  belt-and-braces second copy the C0 plan called for.
- `crm-schema.sql` — schema only, for reading/diffing.
- `crm-storage-manifest.csv` — all 685 storage objects (bucket, path, bytes,
  updated_at) extracted from the dump, for verifying the bucket download.
- `download-crm-buckets.mjs` — Node script (no deps) that downloads every
  storage bucket file. See header for usage; needs the CRM project's
  service_role key from Lovable Cloud backend settings.

## Storage buckets still to download (C0 remaining)

From the dump's storage metadata (2026-07-16):

| Bucket | Files | Size |
|---|---|---|
| job-documents | 184 | 309 MB |
| db-snapshots | 330 | 20 MB |
| company-photos | 163 | 28 MB |
| company-logos | 4 | 4.9 MB |
| contract-templates | 4 | 1.9 MB |
| company-assets / client-portal-uploads / database_export_16_07_26 | 0 | — |

Total ≈ 363 MB / 685 files. Note: the CRM apparently snapshots its own DB into
`db-snapshots` (330 files) — a nice extra safety net, and worth keeping.

## C0 status after this session

1. ~~Official Lovable export~~ ✅ (2026-07-17)
2. ~~Verify the dump restores~~ ✅ (this session — restored + row-counts match)
3. Storage bucket download — **pending**: Ben runs `download-crm-buckets.mjs`
   (needs `CRM_SUPABASE_URL` + `CRM_SERVICE_ROLE_KEY` from Lovable Cloud
   settings), then cross-checks `download-report.csv` against the manifest.
4. Second off-machine copy (cloud drive) of `backups/` — pending, 5 min.
5. Repeat the Lovable export before each later cut-over step (C2).

After 3–4, C0 is done and C1 (Cloudflare Pages hosting of the CRM app) can
start with zero data risk.
