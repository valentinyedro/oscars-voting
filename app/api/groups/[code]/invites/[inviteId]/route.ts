import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type PatchBody = {
  display_name?: string;
};

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ code: string; inviteId: string }> }
) {
  try {
    const { code, inviteId } = await ctx.params;

    const url = new URL(req.url);
    const adminToken = url.searchParams.get("k");
    if (!adminToken) {
      return NextResponse.json({ error: "Missing admin token" }, { status: 400 });
    }

    const body = (await req.json()) as PatchBody;
    const displayName = (body.display_name ?? "").trim();

    if (!displayName) {
      return NextResponse.json({ error: "display_name is required" }, { status: 400 });
    }
    if (displayName.length > 40) {
      return NextResponse.json({ error: "Name is too long (max 40 characters)" }, { status: 400 });
    }

    // 1) Find group by code
    const { data: group, error: groupError } = await supabaseServer
      .from("groups")
      .select("id")
      .eq("code", code)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // 2) Auth: adminToken must be a host invite in this group
    const { data: adminInvite, error: adminError } = await supabaseServer
      .from("invites")
      .select("id, role")
      .eq("group_id", group.id)
      .eq("token", adminToken)
      .single();

    if (adminError || !adminInvite || adminInvite.role !== "host") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 3) Ensure invite belongs to group
    const { data: targetInvite, error: targetError } = await supabaseServer
      .from("invites")
      .select("id, group_id, role")
      .eq("id", inviteId)
      .single();

    if (targetError || !targetInvite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
    if (targetInvite.group_id !== group.id) {
      return NextResponse.json({ error: "Invite does not belong to this group" }, { status: 403 });
    }

    // 4) Update
    const { data: updated, error: updError } = await supabaseServer
      .from("invites")
      .update({ display_name: displayName })
      .eq("id", inviteId)
      .select("id, display_name, role, used_at, token")
      .single();

    if (updError || !updated) {
      return NextResponse.json({ error: "Failed to update invite" }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}