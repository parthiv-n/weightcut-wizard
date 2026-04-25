/**
 * Cross-tenant RLS test suite for the Nutrition v2 schema.
 *
 * Tables under test:
 *   - public.meals
 *   - public.meal_items
 *   - public.foods
 *   - public.meals_with_totals  (view)
 *   - public.nutrition_logs     (compat view)
 *   - RPC public.create_meal_with_items
 *
 * Requires a Supabase test project (NOT production). Env:
 *   SUPABASE_TEST_URL
 *   SUPABASE_TEST_ANON_KEY
 *   SUPABASE_TEST_SERVICE_KEY     (for user seeding + cleanup only)
 *
 * The suite creates two ephemeral users (A, B) via the service role, runs all
 * assertions through anon-key client sessions (so RLS is exercised), and
 * tears down both users at the end.
 *
 * If the test env vars are missing, the suite is skipped cleanly rather than
 * failing CI — keeps the repo green on local dev without a test project.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_KEY;

const hasCreds = Boolean(URL && ANON && SERVICE);
const describeIf = hasCreds ? describe : describe.skip;

type Ctx = {
  admin: SupabaseClient;
  userA: { id: string; email: string; client: SupabaseClient };
  userB: { id: string; email: string; client: SupabaseClient };
  seededMealId: string;
  seededFoodId: string;
};

const ctx = {} as Ctx;

async function signInFreshUser(admin: SupabaseClient, url: string, anon: string) {
  const email = `rls-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const password = "Test!RLS-" + Math.random().toString(36).slice(2);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("user create failed");

  const client = createClient(url, anon, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, client };
}

describeIf("Nutrition v2 RLS — cross-tenant isolation", () => {
  beforeAll(async () => {
    ctx.admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    ctx.userA = await signInFreshUser(ctx.admin, URL!, ANON!);
    ctx.userB = await signInFreshUser(ctx.admin, URL!, ANON!);

    // User A seeds a meal + item via RPC (the supported insert path).
    const { data, error } = await ctx.userA.client.rpc("create_meal_with_items", {
      p_meal: {
        date: new Date().toISOString().slice(0, 10),
        meal_type: "lunch",
        meal_name: "RLS Seed Meal",
        notes: null,
        is_ai_generated: false,
      },
      p_items: [
        { name: "Rice", grams: 150, calories: 195, protein_g: 4, carbs_g: 42, fats_g: 0.4, position: 0 },
      ],
    });
    if (error) throw error;
    ctx.seededMealId = (data as { meal_id: string }).meal_id;

    // User A inserts a user-authored food into the catalog.
    const { data: food, error: foodErr } = await ctx.userA.client
      .from("foods")
      .insert({
        name: "RLS Test Food A",
        calories_per_100g: 100,
        protein_g: 10,
        protein_per_100g: 10,
        carbs_per_100g: 10,
        fats_per_100g: 1,
        source: "user",
        created_by: ctx.userA.id,
      })
      .select("id")
      .single();
    if (foodErr) throw foodErr;
    ctx.seededFoodId = food!.id;
  }, 30_000);

  afterAll(async () => {
    // Cascade-delete both users; meals, meal_items, and user-authored foods
    // with created_by FK SET NULL are handled by DB constraints.
    if (ctx.userA?.id) await ctx.admin.auth.admin.deleteUser(ctx.userA.id);
    if (ctx.userB?.id) await ctx.admin.auth.admin.deleteUser(ctx.userB.id);
  });

  // ---------- meals ----------
  describe("public.meals", () => {
    it("User B cannot SELECT User A's meal", async () => {
      const { data, error } = await ctx.userB.client
        .from("meals")
        .select("id")
        .eq("id", ctx.seededMealId);
      expect(error).toBeNull();
      expect(data).toEqual([]); // RLS hides the row; empty set, not error.
    });

    it("User B cannot UPDATE User A's meal", async () => {
      const { data, error } = await ctx.userB.client
        .from("meals")
        .update({ meal_name: "HIJACKED" })
        .eq("id", ctx.seededMealId)
        .select();
      // Either no rows matched (PostgREST returns empty) or explicit RLS error.
      expect(error === null ? data : []).toEqual([]);

      // Confirm from A's session that the row is untouched.
      const { data: check } = await ctx.userA.client
        .from("meals")
        .select("meal_name")
        .eq("id", ctx.seededMealId)
        .single();
      expect(check?.meal_name).toBe("RLS Seed Meal");
    });

    it("User B cannot DELETE User A's meal", async () => {
      const { data, error } = await ctx.userB.client
        .from("meals")
        .delete()
        .eq("id", ctx.seededMealId)
        .select();
      expect(error === null ? data : []).toEqual([]);

      const { data: check } = await ctx.userA.client
        .from("meals")
        .select("id")
        .eq("id", ctx.seededMealId);
      expect(check?.length).toBe(1);
    });

    it("User A cannot change user_id to User B's id (UPDATE WITH CHECK)", async () => {
      const { error } = await ctx.userA.client
        .from("meals")
        .update({ user_id: ctx.userB.id })
        .eq("id", ctx.seededMealId)
        .select();
      // RLS WITH CHECK must block — expect an error (42501 or row-level violation).
      expect(error).not.toBeNull();
    });

    it("User A cannot INSERT a meal attributed to User B", async () => {
      const { error } = await ctx.userA.client.from("meals").insert({
        user_id: ctx.userB.id,
        date: "2026-04-19",
        meal_type: "snack",
        meal_name: "Forged Meal",
      });
      expect(error).not.toBeNull();
    });
  });

  // ---------- meal_items ----------
  describe("public.meal_items", () => {
    it("User B cannot SELECT items belonging to User A's meal", async () => {
      const { data, error } = await ctx.userB.client
        .from("meal_items")
        .select("id")
        .eq("meal_id", ctx.seededMealId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("User B cannot INSERT a meal_item pointing at User A's meal", async () => {
      const { error } = await ctx.userB.client.from("meal_items").insert({
        meal_id: ctx.seededMealId,
        name: "Injected item",
        grams: 1,
        calories: 1,
        protein_g: 0,
        carbs_g: 0,
        fats_g: 0,
      });
      expect(error).not.toBeNull();
    });

    it("User B cannot UPDATE items in User A's meal", async () => {
      const { data: itemRows } = await ctx.userA.client
        .from("meal_items")
        .select("id")
        .eq("meal_id", ctx.seededMealId);
      const itemId = itemRows?.[0]?.id;
      expect(itemId).toBeTruthy();

      const { data, error } = await ctx.userB.client
        .from("meal_items")
        .update({ name: "hijack" })
        .eq("id", itemId!)
        .select();
      expect(error === null ? data : []).toEqual([]);
    });

    it("User B cannot DELETE items in User A's meal", async () => {
      const { data: before } = await ctx.userA.client
        .from("meal_items")
        .select("id")
        .eq("meal_id", ctx.seededMealId);
      await ctx.userB.client.from("meal_items").delete().eq("meal_id", ctx.seededMealId);
      const { data: after } = await ctx.userA.client
        .from("meal_items")
        .select("id")
        .eq("meal_id", ctx.seededMealId);
      expect(after?.length).toBe(before?.length);
    });
  });

  // ---------- foods ----------
  describe("public.foods (shared catalog)", () => {
    it("Both users can SELECT catalog foods", async () => {
      const a = await ctx.userA.client.from("foods").select("id").eq("id", ctx.seededFoodId);
      const b = await ctx.userB.client.from("foods").select("id").eq("id", ctx.seededFoodId);
      expect(a.data?.length).toBe(1);
      expect(b.data?.length).toBe(1);
    });

    it("Neither user can DELETE catalog foods (no DELETE policy)", async () => {
      const a = await ctx.userA.client.from("foods").delete().eq("id", ctx.seededFoodId).select();
      const b = await ctx.userB.client.from("foods").delete().eq("id", ctx.seededFoodId).select();
      // Deletes return empty or error; row must still exist.
      expect(a.error === null ? a.data : []).toEqual([]);
      expect(b.error === null ? b.data : []).toEqual([]);
      const { data } = await ctx.userA.client.from("foods").select("id").eq("id", ctx.seededFoodId);
      expect(data?.length).toBe(1);
    });

    it("User B cannot UPDATE a food created by User A", async () => {
      const { data, error } = await ctx.userB.client
        .from("foods")
        .update({ name: "hijacked" })
        .eq("id", ctx.seededFoodId)
        .select();
      expect(error === null ? data : []).toEqual([]);
    });

    it("User A cannot flip verified=true on their own unverified food", async () => {
      // Patch migration enforces WITH CHECK (verified = FALSE) so the row
      // becomes invisible-to-update post flip. Either error or empty result.
      const { data, error } = await ctx.userA.client
        .from("foods")
        .update({ verified: true })
        .eq("id", ctx.seededFoodId)
        .select();
      if (!error) expect(data).toEqual([]);
    });

    it("Insert requires created_by = auth.uid()", async () => {
      const { error } = await ctx.userA.client.from("foods").insert({
        name: "Forged",
        calories_per_100g: 0,
        protein_per_100g: 0,
        carbs_per_100g: 0,
        fats_per_100g: 0,
        source: "user",
        created_by: ctx.userB.id, // attribute to someone else
      });
      expect(error).not.toBeNull();
    });
  });

  // ---------- views ----------
  describe("public.meals_with_totals view", () => {
    it("User B cannot see User A's rows through the view", async () => {
      const { data } = await ctx.userB.client
        .from("meals_with_totals")
        .select("id")
        .eq("id", ctx.seededMealId);
      expect(data).toEqual([]);
    });
  });

  describe("public.nutrition_logs (compat view)", () => {
    it("User B cannot see User A's rows through the compat view", async () => {
      const { data } = await ctx.userB.client
        .from("nutrition_logs")
        .select("id")
        .eq("user_id", ctx.userA.id);
      expect(data).toEqual([]);
    });
  });

  // ---------- RPC ----------
  describe("RPC create_meal_with_items", () => {
    it("forces auth.uid() — User B cannot create a meal attributed to User A", async () => {
      const { data, error } = await ctx.userB.client.rpc("create_meal_with_items", {
        p_meal: {
          // Even if caller tries to inject user_id, the RPC must ignore it
          // and bind to auth.uid().
          user_id: ctx.userA.id,
          date: new Date().toISOString().slice(0, 10),
          meal_type: "snack",
          meal_name: "Forged via RPC",
        },
        p_items: [
          { name: "x", grams: 1, calories: 1, protein_g: 0, carbs_g: 0, fats_g: 0, position: 0 },
        ],
      });
      if (error) {
        // Acceptable — RPC rejected.
        expect(error).not.toBeNull();
        return;
      }
      // If RPC accepted, the created meal must belong to B, not A.
      const mealId = (data as { meal_id: string }).meal_id;
      const { data: row } = await ctx.userB.client
        .from("meals")
        .select("user_id")
        .eq("id", mealId)
        .single();
      expect(row?.user_id).toBe(ctx.userB.id);
      expect(row?.user_id).not.toBe(ctx.userA.id);
    });
  });
});
