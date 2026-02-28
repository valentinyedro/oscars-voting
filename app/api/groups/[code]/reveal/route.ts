import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

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

    const { data: group, error: groupError } = await supabaseServer
      .from("groups")
      .select("id, reveal_at, max_members")
      .eq("code", code)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const { data: adminInvite, error: adminError } = await supabaseServer
      .from("invites")
      .select("role")
      .eq("group_id", group.id)
      .eq("token", adminToken)
      .single();

    if (adminError || !adminInvite || adminInvite.role !== "host") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (group.reveal_at) {
      return NextResponse.json({ success: true, revealAt: group.reveal_at });
    }

    const maxMembers = group.max_members ?? 0;
    const threshold = Math.ceil(maxMembers / 2);

    if (maxMembers <= 0) {
      return NextResponse.json({ error: "Invalid group maxMembers" }, { status: 400 });
    }

    // Count voted invites (used_at not null)
    const { count: votedCount, error: votedErr } = await supabaseServer
      .from("invites")
      .select("id", { count: "exact", head: true })
      .eq("group_id", group.id)
      .not("used_at", "is", null);

    if (votedErr) throw votedErr;

    const voted = votedCount ?? 0;

    if (voted < threshold) {
      return NextResponse.json(
        { error: `Reveal requires at least ${threshold} of ${maxMembers} votes.` },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const { error: updError } = await supabaseServer
      .from("groups")
      .update({ reveal_at: now })
      .eq("id", group.id);

    if (updError) throw updError;

    return NextResponse.json({ success: true, revealAt: now });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}