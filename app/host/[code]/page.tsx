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

  const btnPress =
    "transition-transform active:scale-95 motion-reduce:transform-none";

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

  // ---- General init  ----
  const [initialLoading, setInitialLoading] = useState(true);

  // ---- Voting setup state ----
  const [setupKeys, setSetupKeys] = useState<string[]>(() => allCategoryKeys);
  const [setupLocked, setSetupLocked] = useState<boolean>(false);

  // ---- Reveal/results state ----
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [results, setResults] = useState<ResultsResponse | null>(null);

  // ---- Modal state ----
  const [showRevealConfirm, setShowRevealConfirm] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);

  // ---- Edit names ----
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [savingInviteId, setSavingInviteId] = useState<string | null>(null);
  const [editingInviteId, setEditingInviteId] = useState<string | null>(null);

  // ---- Toast ----
  const [progressLoading, setProgressLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);

  type ToastState = {
    msg: string;
    kind: "ok" | "err";
    phase: "enter" | "shown" | "exit";
  };

  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimers = useMemo(() => ({ t1: 0, t2: 0, t3: 0 }), []);

  function showToast(msg: string, kind: "ok" | "err" = "ok") {
    window.clearTimeout(toastTimers.t1);
    window.clearTimeout(toastTimers.t2);
    window.clearTimeout(toastTimers.t3);

    setToast({ msg, kind, phase: "enter" });

    toastTimers.t1 = window.setTimeout(() => {
      setToast((t) => (t ? { ...t, phase: "shown" } : t));
    }, 20);

    // visible duration
    const visibleMs = 1600;

    toastTimers.t2 = window.setTimeout(() => {
      setToast((t) => (t ? { ...t, phase: "exit" } : t));
    }, visibleMs);

    toastTimers.t3 = window.setTimeout(() => {
      setToast(null);
    }, visibleMs + 280);
  }

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
    if (!adminToken) {
      showToast("Missing admin token", "err");
      return;
    }

    const draft = (nameDrafts[inviteId] ?? "").trim();
    if (!draft) {
      showToast("Name cannot be empty.", "err");
      return;
    }

    setSavingInviteId(inviteId);

    try {
      const res = await fetch(
        `/api/groups/${code}/invites/${inviteId}?k=${adminToken}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: draft }),
        }
      );

      const json = await res.json();
      if (!res.ok) {
        showToast(json?.error ?? "Failed to rename", "err");
        return;
      }

      setInvites((prev) =>
        prev.map((inv) =>
          inv.id === inviteId ? { ...inv, display_name: json.display_name } : inv
        )
      );

      showToast("Name updated", "ok");
      setEditingInviteId(null);
    } catch {
      showToast("Failed to rename", "err");
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
  }

  function cancelRename(inv: Invite) {
    setNameDrafts((prev) => ({ ...prev, [inv.id]: inv.display_name ?? "" }));
    setEditingInviteId(null);
  }

  // Auto-generate missing invites to match group's maxMembers
  useEffect(() => {
    if (!code || !adminToken) return;
    if (!status || hasError(status)) return;

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

        await loadInvites();
        setGeneratingInvites(false);

        if (cancelled) return;
        await loadStatus();
      } catch {
        setGeneratingInvites(false);
        showToast("Failed to generate invites", "err");
      }
    })();

    return () => {
      cancelled = true;
      setGeneratingInvites(false);
    };
  }, [code, adminToken, status, invites.length]);

  async function applySetup() {
    if (!adminToken) {
      showToast("Missing admin token", "err");
      return;
    }
    if (setupLocked) {
      showToast("Voting setup is locked — votes have already been cast.", "err");
      return;
    }
    if (setupKeys.length === 0) {
      showToast("Select at least one category.", "err");
      return;
    }

    setApplyLoading(true);
    try {
      const res = await fetch(`/api/groups/${code}/setup?k=${adminToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryKeys: setupKeys }),
      });

      const json = await res.json();
      if (!res.ok) {
        showToast(json?.error ?? "Failed to setup voting", "err");
        return;
      }

      showToast("Voting setup applied", "ok");
      setResults(null);
    } catch {
      showToast("Failed to setup voting", "err");
    } finally {
      setApplyLoading(false);
    }
  }

  async function loadStatus() {
    if (!adminToken) return;

    const res = await fetch(`/api/groups/${code}/status?k=${adminToken}`);
    const json = (await res.json()) as StatusResponse;
    setStatus(json);

    if (!hasError(json) && json.group.revealAt) {
      await loadResults();
    }
  }

  async function refreshProgress() {
    if (!adminToken) {
      showToast("Missing admin token", "err");
      return;
    }

    setProgressLoading(true);
    try {
      await Promise.all([loadStatus(), loadInvites()]);
      showToast("Progress updated", "ok");
    } catch {
      showToast("Failed to refresh progress", "err");
    } finally {
      setProgressLoading(false);
    }
  }

  async function loadResults() {
    if (!adminToken) return;
    const res = await fetch(`/api/groups/${code}/results?k=${adminToken}`);
    const json = (await res.json()) as ResultsResponse;
    setResults(json);
  }

  async function revealNowConfirmed() {
    if (!adminToken) {
      showToast("Missing admin token", "err");
      return;
    }

    setRevealLoading(true);

    try {
      const res = await fetch(`/api/groups/${code}/reveal?k=${adminToken}`, {
        method: "POST",
      });
      const json = await res.json();

      if (!res.ok) {
        showToast(json?.error ?? "Reveal failed", "err");
        return;
      }

      showToast("Revealed ✓ Voting is now closed.", "ok");
      await loadStatus();
      setShowRevealConfirm(false);
    } catch {
      showToast("Reveal failed", "err");
    } finally {
      setRevealLoading(false);
    }
  }

  // load ALL (status + invites + setup + results if revealed) before rendering "ready"
  useEffect(() => {
    if (!code || !adminToken) return;

    let cancelled = false;

    (async () => {
      setInitialLoading(true);

      try {
        const [invRes, statusRes, setupRes] = await Promise.all([
          fetch(`/api/groups/${code}/invites?k=${adminToken}`),
          fetch(`/api/groups/${code}/status?k=${adminToken}`),
          fetch(`/api/groups/${code}/setup?k=${adminToken}`),
        ]);

        const [invJson, statusJson, setupJson] = await Promise.all([
          invRes.json(),
          statusRes.json(),
          setupRes.json().catch(() => null),
        ]);

        if (cancelled) return;

        setInvites(invJson ?? []);
        setStatus(statusJson as StatusResponse);

        // setup (fallbacks sanos)
        if (setupRes.ok && setupJson?.categoryKeys) {
          setSetupKeys(setupJson.categoryKeys ?? allCategoryKeys);
          setSetupLocked(!!setupJson.hasVotes);
        } else {
          setSetupKeys(allCategoryKeys);
          setSetupLocked(false);
        }

        // if revealed, load results BEFORE unlocking UI
        const s = statusJson as StatusResponse;
        if (!hasError(s) && s.group.revealAt) {
          const r2 = await fetch(`/api/groups/${code}/results?k=${adminToken}`);
          const j2 = (await r2.json()) as ResultsResponse;
          if (!cancelled) setResults(j2);
        } else {
          if (!cancelled) setResults(null);
        }
      } catch {
        if (!cancelled) {
          showToast("Failed to load host panel data", "err");
        }
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, adminToken, allCategoryKeys]);

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

  async function copyLink(token: string) {
    const link = `${window.location.origin}/g/${code}?t=${token}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast("Invite link copied", "ok");
    } catch {
      showToast("Could not copy link", "err");
    }
  }

  async function shareInvite(invite: Invite) {
    const link = `${window.location.origin}/g/${code}?t=${invite.token}`;

    const message = `Hey ${invite.display_name}!

  You’re invited to vote in our Oscars ballot 🎬🏆

  Cast your vote here:
  ${link}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Oscars Voting",
          text: message,
          url: link,
        });
        showToast("Invitation shared", "ok");
      } else {
        // fallback: copy to clipboard
        await navigator.clipboard.writeText(message);
        showToast("Invitation copied to clipboard", "ok");
      }
    } catch {
      showToast("Could not share invitation", "err");
    }
  }

  async function copyAdminLink() {
    if (!adminToken) return;
    const admin = `${window.location.origin}/host/${code}?k=${adminToken}`;
    try {
      await navigator.clipboard.writeText(admin);
      showToast("Host panel link copied", "ok");
    } catch {
      showToast("Could not copy link", "err");
    }
  }

  // persist admin token + optionally reflect it in the URL
  useEffect(() => {
    if (!code || !storageKey) return;
    if (!adminToken) return;

    localStorage.setItem(storageKey, adminToken);

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

  const canReveal = !!statusOk?.canReveal;

  function Spinner() {
    return (
      <span
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        aria-hidden="true"
      />
    );
  }

  if (adminToken && initialLoading) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100">
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="flex flex-col items-center gap-3 text-neutral-300">
            <span className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-neutral-300/60 border-t-transparent" />
            <div className="text-sm">Loading host panel…</div>
          </div>
        </div>
      </main>
    );
  }

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
                className={`rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60 ${btnPress}`}
              >
                Copy host panel link
              </button>

              <div className="text-xs text-neutral-500">
                Keep this link private. Anyone with it can modify your voting room
                (setup, invites, reveal). You may use it to access the host panel from different devices.
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
              disabled={!adminToken || progressLoading}
              className={`rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60 ${btnPress}`}
            >
              <span className="inline-flex items-center gap-2">
                {progressLoading && <Spinner />}
                {progressLoading ? "Checking..." : "Check voting progress"}
              </span>
            </button>

            <button
              disabled={!adminToken || isRevealed || revealLoading || !canReveal}
              onClick={() => {
                if (!isRevealed && canReveal) setShowRevealConfirm(true);
                if (!canReveal && !isRevealed) {
                  showToast("Not ready to reveal yet.", "err");
                }
              }}
              className={[
                `rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${btnPress}`,
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
                <span className="ml-2 text-yellow-200">(Not ready)</span>
              )}
            </div>
          )}

          {results && hasError(results) && (
            <div className="text-sm text-red-200">{results.error}</div>
          )}

          {resultsOk && (
            <div className="pt-2 space-y-4">
              <div className="text-sm text-neutral-400">
                Results for:{" "}
                <span className="font-mono">{resultsOk.group.code}</span>
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
              className={`rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60 ${btnPress}`}
            >
              Select All
            </button>

            <button
              onClick={selectBig5}
              disabled={setupLocked}
              className={`rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60 ${btnPress}`}
            >
              Big 5
            </button>

            <button
              onClick={selectBig8}
              disabled={setupLocked}
              className={`rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60 ${btnPress}`}
            >
              Big 8
            </button>

            <button
              onClick={selectActingOnly}
              disabled={setupLocked}
              className={`rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60 ${btnPress}`}
            >
              Acting Only
            </button>

            <button
              onClick={selectAboveTheLine}
              disabled={setupLocked}
              className={`rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60 ${btnPress}`}
            >
              Above the Line
            </button>

            <button
              onClick={selectTechnicalAwards}
              disabled={setupLocked}
              className={`rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60 ${btnPress}`}
            >
              Technical Awards
            </button>

            <button
              onClick={clearAll}
              disabled={setupLocked}
              className={`rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60 ${btnPress}`}
            >
              Clear
            </button>

            <button
              onClick={applySetup}
              disabled={setupLocked || applyLoading}
              className={`rounded-md bg-yellow-500 px-3 py-2 text-sm font-medium text-black hover:bg-yellow-400 disabled:opacity-60 ${btnPress}`}
            >
              <span className="inline-flex items-center gap-2">
                {applyLoading && <Spinner />}
                {setupLocked ? "Setup locked" : applyLoading ? "Applying..." : "Apply setup"}
              </span>
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {catalogCategories.map((cat) => {
              const checked = setupKeys.includes(cat.key);
              const disabledClass = setupLocked
                ? "opacity-95"
                : "hover:bg-neutral-900";
              const checkedClass =
                setupLocked && checked
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
                    className={`accent-yellow-500 ${setupLocked ? "opacity-60" : ""}`}
                  />
                  <span>{cat.name}</span>
                </label>
              );
            })}
          </div>

          {setupLocked && (
            <div className="text-sm text-yellow-200">
              Voting setup locked — votes have been cast.
            </div>
          )}

          <div className="text-xs text-neutral-500">
            Tip: Smaller ballots increase completion rate. You can adjust the
            setup until the first ballot is submitted.
          </div>
        </div>

        {/* Generating invites (show only while generating) */}
        {generatingInvites && (
          <div className="rounded-xl border border-neutral-800 p-4">
            <div className="text-sm text-neutral-300">Generating invites…</div>
          </div>
        )}

        {/* Invites list */}
        <div className="rounded-xl border border-neutral-800 p-4">
          <h2 className="text-lg font-medium mb-3">Invites</h2>
          <p className="text-sm text-neutral-400 mt-1 mb-3">
            One link per person.
            Each invite is unique — make sure it reaches the right hands.
          </p>
          <div className="space-y-2">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="border border-neutral-800 p-3 rounded-md"
              >
                <div className="flex items-start justify-between gap-3 sm:items-center">
                  {/* LEFT SIDE */}
                  <div className="min-w-0 space-y-1">
                    {editingInviteId !== invite.id ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium">
                          {invite.role === "host"
                            ? `${invite.display_name} (Host)`
                            : invite.display_name}
                        </div>

                        <button
                          onClick={() => startRename(invite)}
                          disabled={!adminToken}
                          className="text-xs bg-neutral-800 px-2 py-1 rounded hover:bg-neutral-700 disabled:opacity-60 transition-transform active:scale-95"
                        >
                          Rename
                        </button>
                      </div>
                    ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        value={nameDrafts[invite.id] ?? ""}
                        onChange={(e) =>
                          setNameDrafts((prev) => ({
                            ...prev,
                            [invite.id]: e.target.value,
                          }))
                        }
                        className="bg-neutral-900 border border-neutral-800 px-2 py-1 rounded-md text-sm w-full sm:w-64"
                        placeholder="Display name"
                        autoFocus
                      />

                      <div className="flex gap-2">
                        <button
                          onClick={() => saveInviteName(invite.id)}
                          disabled={!adminToken || savingInviteId === invite.id}
                          className={`text-sm bg-yellow-500 text-black px-3 py-1 rounded hover:bg-yellow-400 disabled:opacity-60 ${btnPress}`}
                        >
                          {savingInviteId === invite.id ? "Saving..." : "Save"}
                        </button>

                        <button
                          onClick={() => cancelRename(invite)}
                          disabled={savingInviteId === invite.id}
                          className={`text-sm bg-neutral-800 px-3 py-1 rounded hover:bg-neutral-700 disabled:opacity-60 ${btnPress}`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="text-sm text-neutral-400">
                      {invite.used_at ? "Voted" : "Pending"}
                    </div>
                  </div>

                  {/* RIGHT SIDE (botones arriba en mobile) */}
                  {invite.role === "host" ? (
                    <button
                      onClick={() => {
                        window.open(
                          `/g/${code}?t=${invite.token}`,
                          "_blank",
                          "noopener,noreferrer"
                        );
                      }}
                      className="text-sm bg-yellow-500 text-black px-3 py-1 rounded hover:bg-yellow-400 transition-transform active:scale-95"
                    >
                      Vote
                    </button>
                  ) : (
                  <div className="shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button
                      onClick={() => copyLink(invite.token)}
                      className="text-sm bg-neutral-800 px-3 py-1 rounded hover:bg-neutral-700 transition-transform active:scale-95"
                    >
                      Copy link
                    </button>

                    <button
                      onClick={() => shareInvite(invite)}
                      className="text-sm bg-yellow-500 text-black px-3 py-1 rounded hover:bg-yellow-400 transition-transform active:scale-95"
                    >
                      Share invitation
                    </button>
                  </div>
                  )}
                </div>
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
              This action will <span className="font-medium">close voting</span>.
              Once revealed, no one will be able to submit votes.
            </p>

            <p className="mt-2 text-sm text-neutral-400">
              Use this only when you&apos;re ready to show results (even if some
              people didn&apos;t vote).
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                disabled={revealLoading}
                onClick={() => setShowRevealConfirm(false)}
                className={`rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60 ${btnPress}`}
              >
                Cancel
              </button>

              <button
                disabled={revealLoading}
                onClick={revealNowConfirmed}
                className={`rounded-md bg-yellow-500 px-3 py-2 text-sm font-medium text-black hover:bg-yellow-400 disabled:opacity-60 ${btnPress}`}
              >
                {revealLoading ? "Revealing..." : "Yes, reveal & close voting"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
          <div
            role="status"
            aria-live="polite"
            className={[
              "relative overflow-hidden rounded-xl border shadow-2xl",
              "backdrop-blur-md",
              "px-4 py-3",
              "transition-all duration-300 ease-out",
              toast.kind === "err"
                ? "border-red-500/40 bg-red-950/90 text-red-50"
                : "border-yellow-500/30 bg-neutral-950/95 text-neutral-50",
              toast.phase === "enter"
                ? "opacity-0 translate-y-3 scale-[0.98]"
                : toast.phase === "exit"
                ? "opacity-0 translate-y-3 scale-[0.98]"
                : "opacity-100 translate-y-0 scale-100",
            ].join(" ")}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {toast.kind === "err" ? (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15 border border-red-500/30">
                    ✕
                  </span>
                ) : (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-100">
                    ✓
                  </span>
                )}
              </div>

              <div className="flex-1">
                <div className="text-sm font-medium leading-5">{toast.msg}</div>
                <div className="mt-0.5 text-xs opacity-80">
                  {toast.kind === "err" ? "Try again." : "Done."}
                </div>
              </div>

              <button
                onClick={() => {
                  setToast((t) => (t ? { ...t, phase: "exit" } : t));
                  window.setTimeout(() => setToast(null), 280);
                }}
                className={`rounded-md px-2 py-1 text-xs opacity-80 hover:opacity-100 ${btnPress}`}
                aria-label="Dismiss"
              >
                Close
              </button>
            </div>

            <div className="absolute bottom-0 left-0 h-1 w-full bg-white/10">
              <div
                className={[
                  "h-full origin-left",
                  toast.kind === "err" ? "bg-red-400/70" : "bg-yellow-400/60",
                  toast.phase === "shown" ? "scale-x-0" : "scale-x-100",
                  "transition-transform ease-linear",
                ].join(" ")}
                style={{ transitionDuration: "1600ms" }}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}