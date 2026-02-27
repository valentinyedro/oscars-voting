import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

function generateToken() {
  return randomBytes(32).toString("hex");
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code: groupCode } = await ctx.params;
    const url = new URL(req.url);
    const adminToken = url.searchParams.get("k");
    if (!adminToken) {
      return NextResponse.json({ error: "Missing admin token" }, { status: 400 });
    }
    const body = await req.json();
    const count = Number(body.count);

    if (!groupCode) {
      return NextResponse.json({ error: "Missing group code" }, { status: 400 });
    }

    if (!Number.isFinite(count) || count < 1) {
      return NextResponse.json({ error: "Invalid count" }, { status: 400 });
    }

    // 1) Find group
    const { data: group, error: groupError } = await supabaseServer
      .from("groups")
      .select("id, max_members")
      .eq("code", groupCode)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Auth: adminToken must be a host invite in this group
    const { data: adminInvite, error: adminError } = await supabaseServer
      .from("invites")
      .select("id, role")
      .eq("group_id", group.id)
      .eq("token", adminToken)
      .single();

    if (adminError || !adminInvite || adminInvite.role !== "host") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Count existing invites
    const { count: existingCount, error: countError } = await supabaseServer
      .from("invites")
      .select("*", { count: "exact", head: true })
      .eq("group_id", group.id);

    if (countError) throw countError;

    if ((existingCount ?? 0) + count > group.max_members) {
      return NextResponse.json(
        { error: "Exceeds max members" },
        { status: 400 }
      );
    }

    // 3) Create invites
    const invites = Array.from({ length: count }).map(() => ({
      group_id: group.id,
      token: generateToken(),
      display_name: "Guest",
      role: "guest",
    }));

    const { error: insertError } = await supabaseServer.from("invites").insert(invites);
    if (insertError) throw insertError;

    return NextResponse.json({ success: true });
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
    const { code: groupCode } = await ctx.params;
    const url = new URL(req.url);
    const adminToken = url.searchParams.get("k");
    if (!adminToken) {
      return NextResponse.json({ error: "Missing admin token" }, { status: 400 });
    }

    const { data: group, error: groupError } = await supabaseServer
      .from("groups")
      .select("id")
      .eq("code", groupCode)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Auth: adminToken must be a host invite in this group
    const { data: adminInvite, error: adminError } = await supabaseServer
      .from("invites")
      .select("id, role")
      .eq("group_id", group.id)
      .eq("token", adminToken)
      .single();

    if (adminError || !adminInvite || adminInvite.role !== "host") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: invites, error } = await supabaseServer
      .from("invites")
      .select("id, display_name, role, used_at, token, created_at")
      .eq("group_id", group.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (error) throw error;

    return NextResponse.json(invites);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
