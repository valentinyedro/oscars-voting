import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

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
      .select("id, max_members, reveal_at, title")
      .eq("code", code)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // auth: token must be host in this group
    const { data: adminInvite, error: adminError } = await supabaseServer
      .from("invites")
      .select("role")
      .eq("group_id", group.id)
      .eq("token", adminToken)
      .single();

    if (adminError || !adminInvite || adminInvite.role !== "host") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // counts
    const { count: totalInvites, error: totalErr } = await supabaseServer
      .from("invites")
      .select("*", { count: "exact", head: true })
      .eq("group_id", group.id);

    if (totalErr) throw totalErr;

    const { count: votedCount, error: votedErr } = await supabaseServer
      .from("invites")
      .select("*", { count: "exact", head: true })
      .eq("group_id", group.id)
      .not("used_at", "is", null);

    if (votedErr) throw votedErr;

    const maxMembers = group.max_members ?? 0;
    const voted = votedCount ?? 0;
    const threshold = Math.ceil(maxMembers / 2);

    const canReveal = !group.reveal_at && maxMembers > 0 && voted >= threshold;

    return NextResponse.json({
      group: { title: group.title, revealAt: group.reveal_at, maxMembers },
      counts: { totalInvites: totalInvites ?? 0, voted },
      canReveal,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}