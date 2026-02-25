"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

type ApiCategory = { id: string; name: string; nominees: { id: string; name: string }[] };

type VoteGetResponse =
  | {
      group: { title: string; code: string; revealAt: string | null };
      invite: { displayName: string; role: string; usedAt: string | null };
      alreadyVoted: boolean;
      categories: ApiCategory[];
    }
  | { error: string };

export default function GroupVotePage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();

  const code = params.code;
  const token = searchParams.get("t");

  const [data, setData] = useState<VoteGetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [choices, setChoices] = useState<Record<string, string>>({}); // categoryId -> nomineeId

  const categories = useMemo(() => {
    if (!data || "error" in data) return [];
    return data.categories;
  }, [data]);

  useEffect(() => {
    if (!code || !token) {
      setLoading(false);
      setData({ error: "Missing group code or token" });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/groups/${code}/vote?t=${token}`);
        const json = (await res.json()) as VoteGetResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData({ error: "Network error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, token]);

  async function submit() {
    if (!code || !token) return;

    setError(null);

    // validate complete
    const required = categories.length;
    const filled = Object.keys(choices).length;
    if (required > 0 && filled !== required) {
      setError("Please vote in every category before submitting.");
      return;
    }

    setSubmitLoading(true);
    try {
      const votes = categories.map((c) => ({
        categoryId: c.id,
        nomineeId: choices[c.id],
      }));

      const res = await fetch(`/api/groups/${code}/vote?t=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ votes }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Failed to submit");
        return;
      }

      // reload to show "already voted"
      const r2 = await fetch(`/api/groups/${code}/vote?t=${token}`);
      const j2 = (await r2.json()) as VoteGetResponse;
      setData(j2);
    } catch {
      setError("Network error while submitting.");
    } finally {
      setSubmitLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
        Loading...
      </main>
    );
  }

  if (!data || "error" in data) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
        <div className="max-w-lg space-y-3">
          <h1 className="text-2xl font-semibold">Could not open ballot</h1>
          <p className="text-neutral-300">{data?.error ?? "Unknown error"}</p>
          <Link className="underline text-neutral-300" href="/">
            Back
          </Link>
        </div>
      </main>
    );
  }

  if (data.categories.length === 0) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
        <div className="max-w-lg space-y-3">
          <h1 className="text-2xl font-semibold">{data.group.title}</h1>
          <p className="text-neutral-300">
            Voting is not set up yet. Ask the host to select categories and nominees.
          </p>
        </div>
      </main>
    );
  }

  if (data.alreadyVoted) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
        <div className="max-w-lg space-y-3">
          <h1 className="text-2xl font-semibold">{data.group.title}</h1>
          <p className="text-neutral-300">You already voted. 🎬</p>
          <p className="text-neutral-400 text-sm">Wait for results or the host reveal.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">{data.group.title}</h1>
          <p className="text-neutral-400 text-sm">
            Voting as: {data.invite.displayName} ({data.invite.role})
          </p>
        </div>

        {categories.map((cat) => (
          <div key={cat.id} className="rounded-xl border border-neutral-800 p-4 space-y-3">
            <h2 className="text-lg font-medium">{cat.name}</h2>

            <div className="space-y-2">
              {cat.nominees.map((n) => (
                <label
                  key={n.id}
                  className="flex items-center gap-3 rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2 cursor-pointer hover:bg-neutral-900"
                >
                  <input
                    type="radio"
                    name={cat.id}
                    value={n.id}
                    checked={choices[cat.id] === n.id}
                    onChange={() => setChoices((prev) => ({ ...prev, [cat.id]: n.id }))}
                  />
                  <span>{n.name}</span>
                </label>
              ))}
            </div>
          </div>
        ))}

        {error && (
          <div className="rounded-md border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitLoading}
          className="w-full rounded-md bg-yellow-500 px-4 py-3 font-medium text-black hover:bg-yellow-400 disabled:opacity-60"
        >
          {submitLoading ? "Submitting..." : "Submit ballot"}
        </button>
      </div>
    </main>
  );
}