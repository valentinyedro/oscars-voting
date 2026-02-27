"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type ResultsResponse =
  | {
      group: { title: string; code: string; revealAt: string };
      results: {
        categoryId: string;
        categoryName: string;
        nominees: { nomineeId: string; nomineeName: string; votes: number }[];
      }[];
    }
  | { error: string };

function hasError(x: unknown): x is { error: string } {
  return !!x && typeof x === "object" && "error" in x;
}

export default function PublicResultsPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;

  const [data, setData] = useState<ResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/r/${code}`;
  }, [code]);

  useEffect(() => {
    if (!code) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/groups/${code}/public-results`);
        const json = (await res.json()) as ResultsResponse;
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
  }, [code]);

  async function share() {
    const text = `Oscars Voting results: ${code}`;
    const url = shareUrl;

    // Web Share API (mobile friendly)
    if (navigator.share) {
      try {
        await navigator.share({ title: "Oscars Voting", text, url });
        return;
      } catch {
        // user cancelled -> ignore
      }
    }

    // Fallback: open X share + copy link
    const x = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      `${text} ${url}`
    )}`;
    window.open(x, "_blank", "noopener,noreferrer");

    try {
      await navigator.clipboard.writeText(url);
      alert("Link copied");
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
        Loading...
      </main>
    );
  }

  if (!data || hasError(data)) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
        <div className="max-w-lg space-y-3">
          <h1 className="text-2xl font-semibold">Results not available</h1>
          <p className="text-neutral-300">{data && hasError(data) ? data.error : "Unknown error"}</p>
          <Link className="underline text-neutral-300" href="/">
            Back
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">{data.group.title}</h1>
            <p className="text-neutral-400 text-sm">
              Public results • Group <span className="font-mono">{data.group.code}</span>
            </p>
          </div>

          <button
            onClick={share}
            className="rounded-md bg-yellow-500 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-400"
          >
            Share
          </button>
        </div>

        {data.results.map((cat) => {
          const topVotes = Math.max(...cat.nominees.map((n) => n.votes));
          const winners = topVotes > 0 ? cat.nominees.filter((n) => n.votes === topVotes).length : 0;

          return (
            <div key={cat.categoryId} className="rounded-xl border border-neutral-800 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-medium">{cat.categoryName}</h2>
                {winners > 1 && topVotes > 0 && (
                  <span className="text-xs text-neutral-400">Tie</span>
                )}
              </div>

              <div className="mt-3 space-y-2 text-sm">
                {cat.nominees.map((n) => {
                  const isWinner = topVotes > 0 && n.votes === topVotes;
                  return (
                    <div
                      key={n.nomineeId}
                      className={[
                        "flex justify-between gap-3 rounded-md border px-3 py-2",
                        isWinner
                          ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-200"
                          : "border-neutral-800 bg-neutral-900/40 text-neutral-300",
                      ].join(" ")}
                    >
                      <span className={isWinner ? "font-medium" : ""}>
                        {n.nomineeName} {isWinner ? "🏆" : ""}
                      </span>
                      <span className="font-mono">{n.votes}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="pt-2 text-xs text-neutral-500">
          Share link: <span className="font-mono">{shareUrl}</span>
        </div>
      </div>
    </main>
  );
}