"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { OSCARS_CATALOG } from "@/lib//catalog";

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

  type StatusOk = Exclude<StatusResponse, { error: string }>;

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
  const [generatingInvites, setGeneratingInvites] = useState(false);

  // ---- Catalog-derived categories (stable order) ----
  const catalogCategories = useMemo(() => {
    return [...OSCARS_CATALOG].sort((a, b) => {
      const ao = a.sort_order ?? 9999;
      const bo = b.sort_order ?? 9999;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    });
  }, []);

  const allCategoryKeys = useMemo(
    () => catalogCategories.map((c) => c.key),
    [catalogCategories]
  );

  // ---- Voting setup state ----
  // UX default: all selected. (If you prefer none, replace with [])
  const [setupKeys, setSetupKeys] = useState<string[]>(() => allCategoryKeys);
  const [setupMsg, setSetupMsg] = useState<string | null>(null);
  const [setupLocked, setSetupLocked] = useState<boolean>(false);

  // ---- Reveal/results state ----
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [revealMsg, setRevealMsg] = useState<string | null>(null);

  // ---- Modal state ----
  const [showRevealConfirm, setShowRevealConfirm] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);

  // ---- Edit names ----
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [savingInviteId, setSavingInviteId] = useState<string | null>(null);
  const [renameMsg, setRenameMsg] = useState<string | null>(null);
  const [editingInviteId, setEditingInviteId] = useState<string | null>(null);

  function toggleKey(key: string, checked: boolean) {
    setSetupKeys((prev) => {
      if (checked) return prev.includes(key) ? prev : [...prev, key];
      return prev.filter((k) => k !== key);
    });
  }

  function selectAll() {
  setSetupKeys(allCategoryKeys);
}

function selectBig5() {
    setSetupKeys([
      "best-picture",
      "actor-leading",
      "actress-leading",
      "directing",
      "writing-original",
    ]);
  }

function selectBig8() {
    setSetupKeys([
      "best-picture",
      "actress-leading",
      "actor-leading",
      "actress-supporting",
      "actor-supporting",
      "directing",
      "international-feature",
      "animated-feature",
    ]);
  }

function selectActingOnly() {
    setSetupKeys([
      "actor-leading",
      "actress-leading",
      "actor-supporting",
      "actress-supporting",
    ]);
  }

function selectAboveTheLine() {
    setSetupKeys([
      "best-picture",
      "directing",
      "writing-original",
      "writing-adapted",
      "actor-leading",
      "actress-leading",
      "actor-supporting",
      "actress-supporting",
    ]);
  }

function selectTechnicalAwards() {
    setSetupKeys([
      "cinematography",
      "production-design",
      "costume-design",
      "film-editing",
      "sound",
      "visual-effects",
      "makeup-hairstyling",
    ]);
  }

function clearAll() {
    setSetupKeys([]);
  }

  async function loadInvites() {
    const res = await fetch(`/api/groups/${code}/invites?k=${adminToken}`);
    const data = await res.json();
    setInvites(data);
  }

  useEffect(() => {
    // inicializa drafts solo si no existe ya una entrada (para no pisar lo que estás editando)
    setNameDrafts((prev) => {
      const next = { ...prev };
      for (const inv of invites) {
        if (next[inv.id] === undefined) next[inv.id] = inv.display_name ?? "";
      }
      return next;
    });
  }, [invites]);

  async function saveInviteName(inviteId: string) {
    if (!adminToken) return alert("Missing admin token");

    const draft = (nameDrafts[inviteId] ?? "").trim();
    if (!draft) {
      setRenameMsg("Name cannot be empty.");
      return;
    }

    setRenameMsg(null);
    setSavingInviteId(inviteId);

    try {
      const res = await fetch(`/api/groups/${code}/invites/${inviteId}?k=${adminToken}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: draft }),
      });

      const json = await res.json();
      if (!res.ok) {
        setRenameMsg(json?.error ?? "Failed to rename");
        return;
      }

      // ✅ update local state in-place (keeps same order)
      setInvites((prev) =>
        prev.map((inv) =>
          inv.id === inviteId ? { ...inv, display_name: json.display_name } : inv
        )
      );

      setRenameMsg("Name updated ✅");
      setEditingInviteId(null); // ✅ hide input after save
    } finally {
      setSavingInviteId(null);
    }
  }

  function startRename(inv: Invite) {
    setNameDrafts((prev) => ({
      ...prev,
      [inv.id]: prev[inv.id] ?? inv.display_name ?? "",
    }));
    setEditingInviteId(inv.id);
    setRenameMsg(null);
  }

  function cancelRename(inv: Invite) {
    // reset draft to current value
    setNameDrafts((prev) => ({ ...prev, [inv.id]: inv.display_name ?? "" }));
    setEditingInviteId(null);
    setRenameMsg(null);
  }

  // Auto-generate missing invites to match group's maxMembers
  useEffect(() => {
    if (!code || !adminToken) return;
    if (!status || hasError(status)) return;

    // status is valid (not error) here
    const statusOkLocal = status as StatusOk;
    const max = statusOkLocal.group?.maxMembers ?? 0;
    const current = invites.length;
    const delta = max - current;
    if (delta <= 0) return;

    let cancelled = false;

    (async () => {
      setGeneratingInvites(true);
      try {
        await fetch(`/api/groups/${code}/invites?k=${adminToken}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: delta }),
        });

        if (cancelled) return;

        // 1) primero traemos invites (esto ya refleja que están listos)
        await loadInvites();

        if (cancelled) return;

        // 2) ocultar el bloque INMEDIATAMENTE
        setGeneratingInvites(false);

        // 3) refrescar status después (ya sin mostrar “generating”)
        await loadStatus();
      } catch {
        if (!cancelled) setGeneratingInvites(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, adminToken, status, invites.length]);

  async function applySetup() {
    if (!adminToken) {
      alert("Missing admin token");
      return;
    }

    if (setupLocked) {
      setSetupMsg("Voting setup is locked — votes have already been cast.");
      return;
    }

    if (setupKeys.length === 0) {
      setSetupMsg("Select at least one category.");
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

  async function refreshProgress() {
    // status requiere adminToken; invites no
    if (!adminToken) return;

    // en paralelo para que sea más rápido
    await Promise.all([loadStatus(), loadInvites()]);
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
      const res = await fetch(`/api/groups/${code}/invites?k=${adminToken}`);
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
      // load persisted setup and whether it's locked by votes
      try {
        const sres = await fetch(`/api/groups/${code}/setup?k=${adminToken}`);
        const sj = await sres.json();
        if (!cancelled && sres.ok && sj?.categoryKeys) {
          // only set keys if we got a valid array
          setSetupKeys(sj.categoryKeys ?? allCategoryKeys);
          setSetupLocked(!!sj.hasVotes);
        }
      } catch (e) {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, adminToken]);

  useEffect(() => {
    if (!code) return;
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(
        `oscarsVoting:hostMeta:${code}`,
        JSON.stringify({ lastOpenedAt: Date.now() })
      );
    } catch {
      // ignore
    }
  }, [code]);

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

  const maxMembers = statusOk?.group.maxMembers ?? 0;
  const threshold = Math.ceil(maxMembers / 2);
  const voted = statusOk?.counts.voted ?? 0;

  // source of truth from backend:
  const canReveal = !!statusOk?.canReveal;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Host panel</h1>
          <div className="text-sm">
            <Link href="/" className="underline hover:text-neutral-300">
              Back
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 p-4 space-y-3">
        <div className="font-medium">Admin access</div>

        {!adminToken ? (
          <div className="text-sm text-red-200">
            Missing admin token. Open this page using your admin (host) link.
          </div>
        ) : (
          <>
            <button
              onClick={copyAdminLink}
              className="inline-flex items-center justify-center rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
            >
              Copy host panel link
            </button>

            <div className="text-xs text-neutral-500">
              Keep this link private. Anyone with it can modify your voting room (setup, invites, reveal).
            </div>
          </>
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
              onClick={refreshProgress}
              disabled={!adminToken}
              className="rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60"
            >
              Check voting progress
            </button>

            <button
              disabled={!adminToken || isRevealed || revealLoading || !canReveal}
              onClick={() => {
                if (!isRevealed && canReveal) setShowRevealConfirm(true);
              }}
              className={[
                "rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60",
                isRevealed || !canReveal
                  ? "bg-neutral-800 text-neutral-400"
                  : "bg-yellow-500 text-black hover:bg-yellow-400",
              ].join(" ")}
            >
              {isRevealed
                ? "Results revealed 🏆"
                : revealLoading
                ? "Revealing..."
                : "Reveal results"}
            </button>
          </div>
          {adminToken && !isRevealed && statusOk && (
              <div className="text-xs text-neutral-400">
                Reveal requires ≥{" "}
                <span className="font-mono">
                  {threshold}/{maxMembers}
                </span>{" "}
                votes. Current:{" "}
                <span className="font-mono">
                  {voted}/{maxMembers}
                </span>
                {!canReveal && (
                  <span className="ml-2 text-yellow-200">
                    (Not ready)
                  </span>
                )}
              </div>
            )}

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
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium">Voting setup</div>

            <div className="text-xs text-neutral-400">
              Selected:{" "}
              <span className="font-mono">
                {setupKeys.length}/{allCategoryKeys.length}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={selectAll}
              disabled={setupLocked}
              className="rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
            >
              Select All
            </button>

            <button
              onClick={selectBig5}
              disabled={setupLocked}
              className="rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
            >
              Big 5
            </button>

            <button
              onClick={selectBig8}
              disabled={setupLocked}
              className="rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
            >
              Big 8
            </button>

            <button
              onClick={selectActingOnly}
              disabled={setupLocked}
              className="rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
            >
              Acting Only
            </button>

            <button
              onClick={selectAboveTheLine}
              disabled={setupLocked}
              className="rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
            >
              Above the Line
            </button>

            <button
              onClick={selectTechnicalAwards}
              disabled={setupLocked}
              className="rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
            >
              Technical Awards
            </button>

            <button
              onClick={clearAll}
              disabled={setupLocked}
              className="rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
            >
              Clear
            </button>

            <button
              onClick={applySetup}
              disabled={setupLocked}
              className="rounded-md bg-yellow-500 px-3 py-2 text-sm font-medium text-black hover:bg-yellow-400 disabled:opacity-60"
            >
              {setupLocked ? "Setup locked" : "Apply setup"}
            </button>
          </div>

          {setupMsg && <div className="text-sm text-neutral-300">{setupMsg}</div>}

          <div className="grid gap-2 sm:grid-cols-2">
            {catalogCategories.map((cat) => {
              const checked = setupKeys.includes(cat.key);
              const disabledClass = setupLocked ? "opacity-95" : "hover:bg-neutral-900";
              const checkedClass = setupLocked && checked
                ? "bg-yellow-500/10 text-yellow-200 border-yellow-500/30"
                : "text-neutral-200";
              return (
                <label
                  key={cat.key}
                  className={[
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                    "border-neutral-800 bg-neutral-950",
                    checkedClass,
                    disabledClass,
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={setupLocked}
                    onChange={(e) => toggleKey(cat.key, e.target.checked)}
                    className={`${setupLocked ? "opacity-60" : ""} ${setupLocked && checked ? "accent-yellow-500" : ""}`}
                  />
                  <span>{cat.name}</span>
                </label>
              );
            })}
          </div>

          {setupLocked && (
            <div className="text-sm text-yellow-200">Voting setup locked — votes have been cast.</div>
          )}

          <div className="text-xs text-neutral-500">
            Tip: Smaller ballots increase completion rate. You can adjust the setup until the first ballot is submitted.
          </div>
        </div>

        {/* Generating invites (show only while generating) */}
        {generatingInvites && (
          <div className="rounded-xl border border-neutral-800 p-4">
            <div className="text-sm text-neutral-300">
              Generating invites…
            </div>
          </div>
)}

        {/* Invites list */}
        <div className="rounded-xl border border-neutral-800 p-4">
          <h2 className="text-lg font-medium mb-3">Invites</h2>
          <div className="space-y-2">
            {renameMsg && (
              <div className="mb-3 text-sm text-neutral-300">{renameMsg}</div>
            )}
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex justify-between items-center border border-neutral-800 p-3 rounded-md"
              >
                <div>
                  <div className="space-y-1">
                    {/* Name line (normal) */}
                    {editingInviteId !== invite.id ? (
                      <div className="flex items-center gap-2">
                        <div className="font-medium">
                          {invite.role === "host"
                            ? `${invite.display_name} (Host)`
                            : invite.display_name}
                        </div>

                        <button
                          onClick={() => startRename(invite)}
                          disabled={!adminToken}
                          className="text-xs bg-neutral-800 px-2 py-1 rounded hover:bg-neutral-700 disabled:opacity-60"
                        >
                          Rename
                        </button>
                      </div>
                    ) : (
                      // Edit mode
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={nameDrafts[invite.id] ?? ""}
                          onChange={(e) =>
                            setNameDrafts((prev) => ({ ...prev, [invite.id]: e.target.value }))
                          }
                          className="bg-neutral-900 border border-neutral-800 px-2 py-1 rounded-md text-sm w-64"
                          placeholder="Display name"
                          autoFocus
                        />

                        <button
                          onClick={() => saveInviteName(invite.id)}
                          disabled={!adminToken || savingInviteId === invite.id}
                          className="text-sm bg-yellow-500 text-black px-3 py-1 rounded hover:bg-yellow-400 disabled:opacity-60"
                        >
                          {savingInviteId === invite.id ? "Saving..." : "Save"}
                        </button>

                        <button
                          onClick={() => cancelRename(invite)}
                          disabled={savingInviteId === invite.id}
                          className="text-sm bg-neutral-800 px-3 py-1 rounded hover:bg-neutral-700 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    <div className="text-sm text-neutral-400">
                      {invite.used_at ? "Voted" : "Pending"}
                    </div>
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

      {/* Reveal confirm modal */}
      {showRevealConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => !revealLoading && setShowRevealConfirm(false)}
          />
          <div className="relative w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-950 p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Reveal results?</h3>

            <p className="mt-2 text-sm text-neutral-300">
              This action will <span className="font-medium">close voting</span>. Once revealed, no
              one will be able to submit votes.
            </p>

            <p className="mt-2 text-sm text-neutral-400">
              Use this only when you&apos;re ready to show results (even if some people didn&apos;t
              vote).
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