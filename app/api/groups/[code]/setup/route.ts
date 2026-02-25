import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { OSCARS_CATALOG_2026 } from "@/lib/catalog";

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

    // 3) Clear existing setup (MVP: overwrite)
    await supabaseServer.from("categories").delete().eq("group_id", group.id);
    // nominees are cascade deleted via categories -> nominees FK

    // 4) Insert categories
    const selected = OSCARS_CATALOG_2026.filter((c) => categoryKeys.includes(c.key));
    const categoriesToInsert = selected.map((c, idx) => ({
      group_id: group.id,
      name: c.name,
      sort_order: idx,
    }));

    const { data: insertedCategories, error: catInsertError } = await supabaseServer
      .from("categories")
      .insert(categoriesToInsert)
      .select("id, name");

    if (catInsertError) throw catInsertError;

    // 5) Insert nominees
    const nameToId = new Map<string, string>();
    for (const c of insertedCategories ?? []) nameToId.set(c.name, c.id);

    const nomineesToInsert = selected.flatMap((c) => {
      const categoryId = nameToId.get(c.name)!;
      return c.nominees.map((n, idx) => ({
        category_id: categoryId,
        name: n,
        sort_order: idx,
      }));
    });

    const { error: nomInsertError } = await supabaseServer
      .from("nominees")
      .insert(nomineesToInsert);

    if (nomInsertError) throw nomInsertError;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}