import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { OSCARS_CATALOG, type CatalogCategory } from "@/lib/catalog";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const url = new URL(req.url);
    const adminToken = url.searchParams.get("k");

    if (!adminToken) {
      return NextResponse.json({ error: "Missing admin token" }, { status: 400 });
    }

    const body = (await req.json()) as { categoryKeys?: string[] };
    const categoryKeys = body.categoryKeys ?? [];

    if (!Array.isArray(categoryKeys) || categoryKeys.length === 0) {
      return NextResponse.json({ error: "Select at least 1 category" }, { status: 400 });
    }

    // 1) Find group
    const { data: group, error: groupError } = await supabaseServer
      .from("groups")
      .select("id")
      .eq("code", code)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // 2) Validate admin token belongs to this group AND is host
    const { data: adminInvite, error: adminError } = await supabaseServer
      .from("invites")
      .select("id, role")
      .eq("group_id", group.id)
      .eq("token", adminToken)
      .single();

    if (adminError || !adminInvite || adminInvite.role !== "host") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 3) Build selection using REAL catalog
    // Preserve the official-ish order: sort_order if present, else catalog array order
    const catalogSorted = [...OSCARS_CATALOG].sort((a, b) => {
      const ao = a.sort_order ?? 9999;
      const bo = b.sort_order ?? 9999;
      if (ao !== bo) return ao - bo;
      return 0;
    });

    const selected: CatalogCategory[] = catalogSorted.filter((c) =>
      categoryKeys.includes(c.key)
    );

    if (selected.length === 0) {
      return NextResponse.json({ error: "No valid categories selected" }, { status: 400 });
    }

    // 3.5) Prevent changing setup if any ballots (votes) already exist for this group
    const { data: existingBallots, error: ballotError } = await supabaseServer
      .from("ballots")
      .select("id")
      .eq("group_id", group.id)
      .limit(1);

    if (ballotError) throw ballotError;
    if (existingBallots && existingBallots.length > 0) {
      return NextResponse.json(
        { error: "Cannot change setup after votes have been cast" },
        { status: 409 }
      );
    }

    // 4) Clear existing setup (MVP: overwrite)
    // nominees should cascade delete via FK from categories -> nominees
    const { error: delError } = await supabaseServer
      .from("categories")
      .delete()
      .eq("group_id", group.id);

    if (delError) throw delError;

    // 5) Insert categories (sort_order consistent)
    // We choose sort_order = the category's catalog sort_order (1..24) if present,
    // otherwise fallback to the current order index.
    const categoriesToInsert = selected.map((c, idx) => ({
      group_id: group.id,
      name: c.name,
      sort_order: c.sort_order ?? idx + 1,
    }));

    const { data: insertedCategories, error: catInsertError } = await supabaseServer
      .from("categories")
      .insert(categoriesToInsert)
      .select("id, name, sort_order")
      .order("sort_order", { ascending: true });

    if (catInsertError) throw catInsertError;
    if (!insertedCategories || insertedCategories.length !== selected.length) {
      return NextResponse.json({ error: "Failed to insert categories" }, { status: 500 });
    }

    // 6) Map inserted categories back to selected reliably
    // Do NOT map by name (could collide in other years). Use the inserted order.
    const nomineesToInsert = selected.flatMap((cat, catIdx) => {
      const inserted = insertedCategories[catIdx];
      const categoryId = inserted.id;

      return cat.nominees.map((nomineeName, nomineeIdx) => ({
        category_id: categoryId,
        name: nomineeName,
        sort_order: nomineeIdx + 1,
      }));
    });

    const { error: nomInsertError } = await supabaseServer
      .from("nominees")
      .insert(nomineesToInsert);

    if (nomInsertError) throw nomInsertError;

    return NextResponse.json({
      success: true,
      inserted: {
        categories: insertedCategories.length,
        nominees: nomineesToInsert.length,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;

    // find group
    const { data: group, error: groupError } = await supabaseServer
      .from("groups")
      .select("id")
      .eq("code", code)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // load categories for this group
    const { data: categories, error: catError } = await supabaseServer
      .from("categories")
      .select("name")
      .eq("group_id", group.id)
      .order("sort_order", { ascending: true });

    if (catError) throw catError;

    // map saved category names back to catalog keys when possible
    const categoryKeys: string[] = (categories ?? [])
      .map((c: { name: string }) => {
        const found = OSCARS_CATALOG.find((cc) => cc.name === c.name);
        return found ? found.key : null;
      })
      .filter(Boolean) as string[];

    // Require admin token and host validation to read setup/lock status
    const url = new URL(req.url);
    const adminToken = url.searchParams.get("k");
    if (!adminToken) {
      return NextResponse.json({ error: "Missing admin token" }, { status: 401 });
    }

    const { data: adminInvite, error: adminError } = await supabaseServer
      .from("invites")
      .select("id, role")
      .eq("group_id", group.id)
      .eq("token", adminToken)
      .single();

    if (adminError || !adminInvite || adminInvite.role !== "host") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // check if ballots exist (locks setup)
    const { data: existingBallots, error: ballotError } = await supabaseServer
      .from("ballots")
      .select("id")
      .eq("group_id", group.id)
      .limit(1);

    if (ballotError) throw ballotError;

    const hasVotes = !!(existingBallots && existingBallots.length > 0);

    return NextResponse.json({ categoryKeys, hasVotes });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}