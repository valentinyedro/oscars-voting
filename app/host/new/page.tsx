"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type CreateGroupResponse =
  | { code: string; adminLink: string }
  | { error: string };

export default function HostNewPage() {
  const router = useRouter();

  const [title, setTitle] = useState("Oscars Night 2026");
  const [hostName, setHostName] = useState("Valen");
  const [maxMembers, setMaxMembers] = useState(5);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          hostName: hostName.trim(),
          maxMembers,
        }),
      });

      const data: CreateGroupResponse = await res.json();

      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : "Failed to create group");
        return;
      }

      // Redirect to host panel (admin link contains the token)
      console.log("ADMIN LINK:", data.adminLink);
      router.push(data.adminLink);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Create group</h1>
          <p className="text-neutral-300">
            Create a private Oscars ballot room, invite friends, and reveal results together.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-neutral-800 p-5">
          <div className="space-y-1">
            <label className="text-sm text-neutral-300">Group title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:border-yellow-500"
              placeholder="Oscars Night 2026"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-neutral-300">Host name</label>
            <input
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:border-yellow-500"
              placeholder="Your name"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-neutral-300">Voting members (including you)</label>
            <input
              type="number"
              value={maxMembers}
              onChange={(e) => setMaxMembers(Number(e.target.value))}
              className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:border-yellow-500"
              min={1}
              max={200}
              required
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-yellow-500 px-4 py-2 font-medium text-black hover:bg-yellow-400 disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create group"}
          </button>
        </form>

        <div className="text-sm text-neutral-400">
          <Link className="underline hover:text-neutral-200" href="/">
            Back
          </Link>
        </div>
      </div>
    </main>
  );
}
