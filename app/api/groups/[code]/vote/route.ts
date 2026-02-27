import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type VoteItem = { categoryId: string; nomineeId: string };

export async function GET(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const url = new URL(req.url);
    const token = url.searchParams.get("t");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // group
    const { data: group, error: groupError } = await supabaseServer
      .from("groups")
      .select("id, title, code, reveal_at, max_members")
      .eq("code", code)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // invite
    const { data: invite, error: inviteError } = await supabaseServer
      .from("invites")
      .select("id, used_at, display_name, role")
      .eq("group_id", group.id)
      .eq("token", token)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json({ error: "Invalid invite token" }, { status: 401 });
    }

    // categories + nominees
    const { data: categories, error: catError } = await supabaseServer
      .from("categories")
      .select("id, name, sort_order")
      .eq("group_id", group.id)
      .order("sort_order", { ascending: true });

    if (catError) throw catError;

    const categoryIds = (categories ?? []).map((c) => c.id);

    const { data: nominees, error: nomError } = categoryIds.length
      ? await supabaseServer
          .from("nominees")
          .select("id, category_id, name, sort_order")
          .in("category_id", categoryIds)
          .order("sort_order", { ascending: true })
      : { data: [], error: null };

    if (nomError) throw nomError;

    const nomineesByCategory = new Map<string, { id: string; name: string }[]>();
    for (const n of nominees ?? []) {
      const arr = nomineesByCategory.get(n.category_id) ?? [];
      arr.push({ id: n.id, name: n.name });
      nomineesByCategory.set(n.category_id, arr);
    }

    return NextResponse.json({
      group: { title: group.title, code: group.code, revealAt: group.reveal_at },
      invite: { displayName: invite.display_name, role: invite.role, usedAt: invite.used_at },
      alreadyVoted: Boolean(invite.used_at),
      categories: (categories ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        nominees: nomineesByCategory.get(c.id) ?? [],
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await ctx.params;
    const url = new URL(req.url);
    const token = url.searchParams.get("t");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const body = (await req.json()) as { votes?: VoteItem[] };
    const votes = body.votes ?? [];

    // group
    const { data: group, error: groupError } = await supabaseServer
      .from("groups")
      .select("id, reveal_at")
      .eq("code", code)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    if (group.reveal_at) {
    return NextResponse.json(
        { error: "Voting is closed (results have been revealed)" },
        { status: 403 }
    );
    }

    // invite
    const { data: invite, error: inviteError } = await supabaseServer
      .from("invites")
      .select("id, used_at")
      .eq("group_id", group.id)
      .eq("token", token)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json({ error: "Invalid invite token" }, { status: 401 });
    }

    if (invite.used_at) {
      return NextResponse.json({ error: "Already voted" }, { status: 409 });
    }

    // load categories for this group
    const { data: categories, error: catError } = await supabaseServer
      .from("categories")
      .select("id")
      .eq("group_id", group.id);

    if (catError) throw catError;

    const categoryIds = new Set((categories ?? []).map((c) => c.id));
    if (categoryIds.size === 0) {
      return NextResponse.json({ error: "Voting not set up yet" }, { status: 400 });
    }

    // validate: must vote for every category, and nominee must belong to that category
    if (votes.length !== categoryIds.size) {
      return NextResponse.json({ error: "Incomplete ballot" }, { status: 400 });
    }

    const seenCats = new Set<string>();
    for (const v of votes) {
      if (!categoryIds.has(v.categoryId)) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
      if (seenCats.has(v.categoryId)) {
        return NextResponse.json({ error: "Duplicate category vote" }, { status: 400 });
      }
      seenCats.add(v.categoryId);
    }

    // fetch nominees for validation
    const { data: nomineeRows, error: nomError } = await supabaseServer
      .from("nominees")
      .select("id, category_id")
      .in("category_id", Array.from(categoryIds));

    if (nomError) throw nomError;

    const nomineeToCategory = new Map<string, string>();
    for (const n of nomineeRows ?? []) nomineeToCategory.set(n.id, n.category_id);

    for (const v of votes) {
      const cat = nomineeToCategory.get(v.nomineeId);
      if (!cat || cat !== v.categoryId) {
        return NextResponse.json({ error: "Invalid nominee for category" }, { status: 400 });
      }
    }

    // 1) create ballot
    const { data: ballot, error: ballotError } = await supabaseServer
      .from("ballots")
      .insert({
        group_id: group.id,
        invite_id: invite.id,
      })
      .select("id")
      .single();

    if (ballotError) throw ballotError;

    // 2) insert votes
    const voteRows = votes.map((v) => ({
      ballot_id: ballot.id,
      category_id: v.categoryId,
      nominee_id: v.nomineeId,
    }));

    const { error: votesError } = await supabaseServer.from("votes").insert(voteRows);
    if (votesError) throw votesError;

    // 3) mark invite used
    const { error: usedError } = await supabaseServer
      .from("invites")
      .update({ used_at: new Date().toISOString() })
      .eq("id", invite.id);

    if (usedError) throw usedError;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}