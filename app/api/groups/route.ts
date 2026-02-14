import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

function generateCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(length))
    .map((b) => chars[b % chars.length])
    .join("");
}

function generateToken() {
  return randomBytes(32).toString("hex");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, maxMembers, hostName } = body;

    if (!title || !maxMembers || !hostName) {
      return NextResponse.json(
        { error: "Missing fields" },
        { status: 400 }
      );
    }

    const code = generateCode();
    const hostToken = generateToken();

    // 1️⃣ Create group
    const { data: group, error: groupError } = await supabaseServer
      .from("groups")
      .insert({
        code,
        title,
        max_members: maxMembers,
      })
      .select()
      .single();

    if (groupError) throw groupError;

    // 2️⃣ Create host invite
    const { error: inviteError } = await supabaseServer
      .from("invites")
      .insert({
        group_id: group.id,
        token: hostToken,
        display_name: hostName,
        role: "host",
      });

    if (inviteError) throw inviteError;

    return NextResponse.json({
      code,
      adminLink: `/host/${code}?k=${hostToken}`,
    });

    } catch (err: unknown) {
    const message =
        err instanceof Error ? err.message : "Unknown error";

    return NextResponse.json({ error: message }, { status: 500 });
    }
}
