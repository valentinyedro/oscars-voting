"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type Invite = {
  id: string;
  display_name: string;
  role: string;
  used_at: string | null;
  token: string;
};

type StatusResponse =
  | {
      group: { title: string; revealAt: string | null; maxMembers: number };
      counts: { totalInvites: number; voted: number };
      canReveal: boolean;
    }
  | { error: string };

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

export default function HostPanelPage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();

  const code = params.code;
  const urlToken = searchParams.get("k");
  const storageKey = code ? `oscarsVoting:hostToken:${code}` : null;

  const [adminToken, setAdminToken] = useState<string | null>(() => {
    // prioridad: URL > localStorage
    if (typeof window === "undefined") return null;
    if (urlToken) return urlToken;
    if (storageKey) return localStorage.getItem(storageKey);
    return null;
  });

  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteCount, setInviteCount] = useState(1);

  // ---- Voting setup state ----
  const [setupKeys, setSetupKeys] = useState<string[]>([
    "best_picture",
    "best_actor",
    "best_actress",
  ]);
  const [setupMsg, setSetupMsg] = useState<string | null>(null);

  // ---- Reveal/results state ----
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [revealMsg, setRevealMsg] = useState<string | null>(null);

  // ---- Modal state (NEW) ----
  const [showRevealConfirm, setShowRevealConfirm] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);

  async function loadInvites() {
    const res = await fetch(`/api/groups/${code}/invites`);
    const data = await res.json();
    setInvites(data);
  }

  async function generateInvites() {
    await fetch(`/api/groups/${code}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: inviteCount }),
    });
    await loadInvites();
    await loadStatus(); // refresca progreso
  }

  async function applySetup() {
    if (!adminToken) {
      alert("Missing admin token");
      return;
    }
    setSetupMsg(null);

    const res = await fetch(`/api/groups/${code}/setup?k=${adminToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryKeys: setupKeys }),
    });

    const json = await res.json();
    if (!res.ok) {
      setSetupMsg(json?.error ?? "Failed to setup voting");
      return;
    }

    setSetupMsg("Voting setup applied ✅");
    setResults(null); // si cambia setup, invalidamos results cacheados
  }

  async function loadStatus() {
    if (!adminToken) return;

    const res = await fetch(`/api/groups/${code}/status?k=${adminToken}`);
    const json = (await res.json()) as StatusResponse;
    setStatus(json);

    // si ya está revelado, auto-cargar resultados
    if (!hasError(json) && json.group.revealAt) {
      await loadResults();
    }
  }

  async function loadResults() {
    if (!adminToken) return;
    const res = await fetch(`/api/groups/${code}/results?k=${adminToken}`);
    const json = (await res.json()) as ResultsResponse;
    setResults(json);
  }

  async function revealNowConfirmed() {
    if (!adminToken) return;

    setRevealLoading(true);
    setRevealMsg(null);

    try {
      const res = await fetch(`/api/groups/${code}/reveal?k=${adminToken}`, {
        method: "POST",
      });
      const json = await res.json();

      if (!res.ok) {
        setRevealMsg(json?.error ?? "Reveal failed");
        return;
      }

      setRevealMsg("Revealed ✅ Voting is now closed.");
      await loadStatus();
      // loadStatus ya llama loadResults si revealAt != null
      setShowRevealConfirm(false);
    } finally {
      setRevealLoading(false);
    }
  }

  // load invites on mount/when code changes
  useEffect(() => {
    if (!code) return;

    let cancelled = false;

    (async () => {
      const res = await fetch(`/api/groups/${code}/invites`);
      const data = await res.json();
      if (!cancelled) setInvites(data);
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  // load status when adminToken available
  useEffect(() => {
    if (!code || !adminToken) return;

    let cancelled = false;

    (async () => {
      const res = await fetch(`/api/groups/${code}/status?k=${adminToken}`);
      const json = (await res.json()) as StatusResponse;

      if (!cancelled) setStatus(json);

      if (!cancelled && !hasError(json) && json.group.revealAt) {
        const r2 = await fetch(`/api/groups/${code}/results?k=${adminToken}`);
        const j2 = (await r2.json()) as ResultsResponse;
        if (!cancelled) setResults(j2);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, adminToken]);

  function copyLink(token: string) {
    const link = `${window.location.origin}/g/${code}?t=${token}`;
    navigator.clipboard.writeText(link);
    alert("Invite link copied");
  }

  function copyAdminLink() {
    if (!adminToken) return;
    const admin = `${window.location.origin}/host/${code}?k=${adminToken}`;
    navigator.clipboard.writeText(admin);
    alert("Admin link copied");
  }

  // persist admin token + optionally reflect it in the URL
  useEffect(() => {
    if (!code || !storageKey) return;
    if (!adminToken) return;

    localStorage.setItem(storageKey, adminToken);

    // si la URL no tiene k, la actualizamos (solo cosmetico)
    if (!urlToken) {
      window.history.replaceState(null, "", `/host/${code}?k=${adminToken}`);
    }
  }, [code, storageKey, adminToken, urlToken]);

  const statusOk = status && !hasError(status) ? status : null;
  const resultsOk = results && !hasError(results) ? results : null;
  const isRevealed = !!statusOk?.group.revealAt;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Host panel</h1>

        <div className="rounded-xl border border-neutral-800 p-4 space-y-2">
          <div>
            Group code: <span className="font-mono">{code}</span>
          </div>
          <div>Admin token present? {adminToken ? "YES" : "NO"}</div>

          {adminToken && (
            <button
              onClick={copyAdminLink}
              className="inline-flex items-center justify-center rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
            >
              Copy admin link
            </button>
          )}
        </div>

        {/* Progress + Reveal + Results */}
        <div className="rounded-xl border border-neutral-800 p-4 space-y-3">
          <div className="font-medium">Progress</div>

          {!adminToken ? (
            <div className="text-sm text-neutral-400">Missing admin token.</div>
          ) : status === null ? (
            <div className="text-sm text-neutral-400">Loading status...</div>
          ) : hasError(status) ? (
            <div className="text-sm text-red-200">{status.error}</div>
          ) : (
            <div className="text-sm text-neutral-300 space-y-1">
              <div>
                Voted:{" "}
                <span className="font-mono">
                  {statusOk!.counts.voted} / {statusOk!.group.maxMembers}
                </span>
              </div>
              <div>
                Reveal status:{" "}
                <span className="font-mono">
                  {statusOk!.group.revealAt ? "REVEALED" : "HIDDEN"}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadStatus}
              disabled={!adminToken}
              className="rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60"
            >
              Check voting progress
            </button>

            <button
              onClick={() => {
                if (!isRevealed) setShowRevealConfirm(true);
              }}
              className={[
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isRevealed
                  ? "bg-neutral-800 text-neutral-400"
                  : "bg-yellow-500 text-black hover:bg-yellow-400",
              ].join(" ")}
            >
              {isRevealed ? "Results revealed 🏆" : revealLoading ? "Revealing..." : "Reveal results"}
            </button>
          </div>

          {revealMsg && <div className="text-sm text-neutral-300">{revealMsg}</div>}

          {results && hasError(results) && (
            <div className="text-sm text-red-200">{results.error}</div>
          )}

          {resultsOk && (
            <div className="pt-2 space-y-4">
              <div className="text-sm text-neutral-400">
                Results for: <span className="font-mono">{resultsOk.group.code}</span>
              </div>

              {resultsOk.results.map((cat) => {
                const topVotes = Math.max(...cat.nominees.map((n) => n.votes));
                const highlightWinners = topVotes > 0;

                return (
                  <div
                    key={cat.categoryId}
                    className="rounded-lg border border-neutral-800 p-3"
                  >
                    <div className="font-medium mb-2">{cat.categoryName}</div>

                    <div className="space-y-1 text-sm">
                      {cat.nominees.map((n) => {
                        const isWinner = highlightWinners && n.votes === topVotes;
                        return (
                          <div
                            key={n.nomineeId}
                            className={[
                              "flex justify-between gap-3 rounded-md px-2 py-1",
                              isWinner
                                ? "bg-yellow-500/10 text-yellow-200 border border-yellow-500/30"
                                : "text-neutral-300",
                            ].join(" ")}
                          >
                            <span className={isWinner ? "font-medium" : ""}>
                              {n.nomineeName}
                              {isWinner ? " 🏆" : ""}
                            </span>
                            <span className="font-mono">{n.votes}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Voting setup */}
        <div className="rounded-xl border border-neutral-800 p-4 space-y-3">
          <div className="font-medium">Voting setup</div>

          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={setupKeys.includes("best_picture")}
              onChange={(e) =>
                setSetupKeys((prev) =>
                  e.target.checked
                    ? [...prev, "best_picture"]
                    : prev.filter((k) => k !== "best_picture")
                )
              }
            />
            Best Picture
          </label>

          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={setupKeys.includes("best_actor")}
              onChange={(e) =>
                setSetupKeys((prev) =>
                  e.target.checked
                    ? [...prev, "best_actor"]
                    : prev.filter((k) => k !== "best_actor")
                )
              }
            />
            Best Actor
          </label>

          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={setupKeys.includes("best_actress")}
              onChange={(e) =>
                setSetupKeys((prev) =>
                  e.target.checked
                    ? [...prev, "best_actress"]
                    : prev.filter((k) => k !== "best_actress")
                )
              }
            />
            Best Actress
          </label>

          {setupMsg && <div className="text-sm text-neutral-300">{setupMsg}</div>}

          <button
            onClick={applySetup}
            className="inline-flex items-center justify-center rounded-md bg-yellow-500 px-3 py-2 text-sm font-medium text-black hover:bg-yellow-400"
          >
            Apply setup
          </button>
        </div>

        {/* Generate invites */}
        <div className="rounded-xl border border-neutral-800 p-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="number"
              value={inviteCount}
              onChange={(e) => setInviteCount(Number(e.target.value))}
              className="bg-neutral-900 border border-neutral-800 px-3 py-2 rounded-md w-24"
              min={1}
            />
            <button
              onClick={generateInvites}
              className="bg-yellow-500 text-black px-4 py-2 rounded-md hover:bg-yellow-400"
            >
              Generate invites
            </button>
          </div>
        </div>

        {/* Invites list */}
        <div className="rounded-xl border border-neutral-800 p-4">
          <h2 className="text-lg font-medium mb-3">Invites</h2>
          <div className="space-y-2">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex justify-between items-center border border-neutral-800 p-3 rounded-md"
              >
                <div>
                  <div className="font-medium">
                    {invite.role === "host" ? "Host" : invite.display_name}
                  </div>
                  <div className="text-sm text-neutral-400">
                    {invite.used_at ? "Voted" : "Pending"}
                  </div>
                </div>

                <button
                  onClick={() => copyLink(invite.token)}
                  className="text-sm bg-neutral-800 px-3 py-1 rounded hover:bg-neutral-700"
                >
                  Copy link
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reveal confirm modal (NEW) */}
      {showRevealConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => !revealLoading && setShowRevealConfirm(false)}
          />
          <div className="relative w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-950 p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Reveal results?</h3>

            <p className="mt-2 text-sm text-neutral-300">
              This action will <span className="font-medium">close voting</span>. Once revealed,
              no one will be able to submit votes.
            </p>

            <p className="mt-2 text-sm text-neutral-400">
              Use this only when youre ready to show results (even if some people didn&apos;t vote).
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                disabled={revealLoading}
                onClick={() => setShowRevealConfirm(false)}
                className="rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                disabled={revealLoading}
                onClick={revealNowConfirmed}
                className="rounded-md bg-yellow-500 px-3 py-2 text-sm font-medium text-black hover:bg-yellow-400 disabled:opacity-60"
              >
                {revealLoading ? "Revealing..." : "Yes, reveal & close voting"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}