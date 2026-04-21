# Nutrition v2 RLS Audit

**Date:** 2026-04-19
**Reviewer:** security-architect
**Scope:** RLS policies in `20260419020000_create_nutrition_v2.sql`, `20260419030000_meals_with_totals.sql`, and `20260419040000_nutrition_logs_compat_view.sql` (all as specified in `2026-04-19-nutrition-overhaul-design.md`).

**Status at time of audit:** The system-architect had NOT yet written the physical migration files when this audit ran; the `schema_migrations_written` signal in the `nutrition-overhaul-v2` namespace was unset. This audit reviews the SQL embedded in the approved spec, which the architect is contracted to ship verbatim (modulo the holes patched below). Re-run the test suite against the final migrations before marking `rls_verified: true`.

## Table-by-table verdict

| Object | Read scoping | Write scoping | Verdict |
|---|---|---|---|
| `public.meals` | Owner-only via `auth.uid() = user_id` — PASS | INSERT/DELETE PASS; UPDATE missing `WITH CHECK` — **patched** | PASS after patch |
| `public.meal_items` | Owner-only via parent-meal EXISTS check — PASS | INSERT/DELETE PASS; UPDATE missing `WITH CHECK` — **patched** | PASS after patch |
| `public.foods` | Public read — PASS (intended) | INSERT allowed `created_by IS NULL` (loose); UPDATE missing `WITH CHECK` — **patched**. No DELETE policy — deny-by-default OK, explicit deny added | PASS after patch |
| `public.meals_with_totals` (view) | Inherits meals RLS — PASS when `security_invoker=true` — **made explicit** | N/A (view) | PASS after patch |
| `public.nutrition_logs` (compat view) | Inherits meals RLS — PASS when `security_invoker=true` — **made explicit**. Writes are no-ops via RULE — safe | N/A (view, rules block writes) | PASS after patch |
| RPC `create_meal_with_items` | N/A | Must bind `user_id` to `auth.uid()` regardless of `p_meal.user_id` payload — called out in test suite; architect must implement accordingly | CONDITIONAL — verified by test |

## Holes found & patches

All five holes are closed in `supabase/migrations/20260419025000_nutrition_v2_rls_hardening.sql` (additive, does not modify the architect's files):

1. **H1** — `meals` UPDATE lacked `WITH CHECK`, permitting a user to set `user_id` to another user's id while the row was still "theirs." Fix: add `WITH CHECK (auth.uid() = user_id)`.
2. **H2** — `meal_items` UPDATE same pattern: a user could move an item to another user's `meal_id`. Fix: add matching `WITH CHECK` EXISTS clause.
3. **H3** — `foods` UPDATE lacked `WITH CHECK`; user could flip `verified = TRUE` or reassign `created_by`. Fix: add `WITH CHECK (auth.uid() = created_by AND verified = FALSE)`.
4. **H4** — `foods` INSERT allowed `created_by IS NULL`; tightened to require `created_by = auth.uid()`. Service-role writes continue to bypass RLS for server-side USDA/OFF upserts.
5. **H5** — `meals_with_totals` and `nutrition_logs` (compat view) made explicit `security_invoker = true` so view reads are filtered by the caller's RLS, not the view owner's. Default in PG15+, but made explicit for audit clarity.

## Test artifact

`tests/security/nutrition_rls.spec.ts` — Vitest suite covering:

- Cross-tenant SELECT/UPDATE/DELETE denial on `meals` and `meal_items`
- Cross-tenant INSERT forgery attempts (`meal_items.meal_id` → other tenant)
- Self-attribution forgery attempts (H1, H3, H4)
- Compat view and `meals_with_totals` view RLS inheritance
- RPC `create_meal_with_items` auth binding
- `foods` shared-read + no-delete invariants

Suite auto-skips when `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_KEY` env vars are missing so local dev does not fail CI without a test project.

## Recommended follow-up

1. Architect: write the three referenced migration files so this audit can be re-run against real SQL.
2. Apply `20260419025000_nutrition_v2_rls_hardening.sql` immediately after the architect's v2 create migration.
3. Wire the `nutrition_rls.spec.ts` suite into CI with test-project credentials gated to the security-check job only.
4. Set `rls_verified: true` in the `nutrition-overhaul-v2` memory once tests pass end-to-end.
