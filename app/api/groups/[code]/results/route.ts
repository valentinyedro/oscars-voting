import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type ResultNominee = { nomineeId: string; nomineeName: string; votes: number };
type ResultCategory = { categoryId: string; categoryName: string; nominees: ResultNominee[] };

export async function GET(
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

    // group
    const { data: group, error: groupError } = await supabaseServer
      .from("groups")
      .select("id, title, reveal_at")
      .eq("code", code)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // auth host
    const { data: adminInvite, error: adminError } = await supabaseServer
      .from("invites")
      .select("role")
      .eq("group_id", group.id)
      .eq("token", adminToken)
      .single();

    if (adminError || !adminInvite || adminInvite.role !== "host") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // require reveal
    if (!group.reveal_at) {
      return NextResponse.json({ error: "Not revealed yet" }, { status: 403 });
    }

    // categories
    const { data: categories, error: catError } = await supabaseServer
      .from("categories")
      .select("id, name, sort_order")
      .eq("group_id", group.id)
      .order("sort_order", { ascending: true });

    if (catError) throw catError;

    const categoryIds = (categories ?? []).map((c) => c.id);

    // nominees
    const { data: nominees, error: nomError } = categoryIds.length
      ? await supabaseServer
          .from("nominees")
          .select("id, category_id, name, sort_order")
          .in("category_id", categoryIds)
          .order("sort_order", { ascending: true })
      : { data: [], error: null };

    if (nomError) throw nomError;

    // ballots for group
    const { data: ballots, error: balError } = await supabaseServer
      .from("ballots")
      .select("id")
      .eq("group_id", group.id);

    if (balError) throw balError;

    const ballotIds = (ballots ?? []).map((b) => b.id);

    // votes
    const { data: votes, error: voteError } = ballotIds.length
      ? await supabaseServer
          .from("votes")
          .select("category_id, nominee_id")
          .in("ballot_id", ballotIds)
      : { data: [], error: null };

    if (voteError) throw voteError;

    // count votes per nominee
    const counts = new Map<string, number>(); // nominee_id -> count
    for (const v of votes ?? []) {
      counts.set(v.nominee_id, (counts.get(v.nominee_id) ?? 0) + 1);
    }

    // build response
    const nomineesByCategory = new Map<string, { id: string; name: string }[]>();
    for (const n of nominees ?? []) {
      const arr = nomineesByCategory.get(n.category_id) ?? [];
      arr.push({ id: n.id, name: n.name });
      nomineesByCategory.set(n.category_id, arr);
    }

    const results: ResultCategory[] = (categories ?? []).map((c) => {
      const list = nomineesByCategory.get(c.id) ?? [];
      const nomineeResults = list
        .map((n) => ({
          nomineeId: n.id,
          nomineeName: n.name,
          votes: counts.get(n.id) ?? 0,
        }))
        .sort((a, b) => b.votes - a.votes);

      return { categoryId: c.id, categoryName: c.name, nominees: nomineeResults };
    });

    return NextResponse.json({
      group: { title: group.title, code, revealAt: group.reveal_at },
      results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}