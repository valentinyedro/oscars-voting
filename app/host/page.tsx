"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type HostItem = {
  code: string;
  token: string;
  title?: string;
  error?: string;

  // from status
  voted?: number;
  totalInvites?: number;
  maxMembers?: number;
  revealAt?: string | null;
  canReveal?: boolean;

  // local meta
  lastOpenedAt?: number | null;
};

type StatusResponse =
  | {
      group: { title: string; revealAt: string | null; maxMembers: number };
      counts: { totalInvites: number; voted: number };
      canReveal: boolean;
    }
  | { error: string };

function hasError(x: unknown): x is { error: string } {
  return !!x && typeof x === "object" && "error" in x;
}

const TOKEN_PREFIX = "oscarsVoting:hostToken:";
const META_PREFIX = "oscarsVoting:hostMeta:";

function readHostItemsFromStorage(): HostItem[] {
  if (typeof window === "undefined") return [];

  const keys = Object.keys(localStorage).filter((k) => k.startsWith(TOKEN_PREFIX));

  const items = keys
    .map((k) => {
      const code = k.replace(TOKEN_PREFIX, "");
      const token = localStorage.getItem(k) || "";

      let lastOpenedAt: number | null = null;
      const metaRaw = localStorage.getItem(`${META_PREFIX}${code}`);
      if (metaRaw) {
        try {
          const meta = JSON.parse(metaRaw);
          if (typeof meta?.lastOpenedAt === "number") lastOpenedAt = meta.lastOpenedAt;
        } catch {
          // ignore bad meta
        }
      }

      return { code, token, lastOpenedAt };
    })
    .filter((it) => it.code && it.token);

  // default sorting:
  // 1) recently opened first
  // 2) code as tiebreaker
  items.sort((a, b) => {
    const ao = a.lastOpenedAt ?? 0;
    const bo = b.lastOpenedAt ?? 0;
    if (ao !== bo) return bo - ao;
    return a.code.localeCompare(b.code);
  });

  return items;
}

async function mapLimit<T, R>(
  arr: T[],
  limit: number,
  fn: (x: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  let i = 0;

  const workers = Array.from({ length: Math.max(1, limit) }).map(async () => {
    while (i < arr.length) {
      const idx = i++;
      out[idx] = await fn(arr[idx]);
    }
  });

  await Promise.all(workers);
  return out;
}

export default function HostListPage() {
  const router = useRouter();

  const [items, setItems] = useState<HostItem[] | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<HostItem | null>(null);

  const shareOrigin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  function reloadFromStorage() {
    setItems(readHostItemsFromStorage());
  }

  useEffect(() => {
    reloadFromStorage();

    // If tokens change from another tab
    function onStorage(e: StorageEvent) {
      if (!e.key) return;
      if (e.key.startsWith(TOKEN_PREFIX) || e.key.startsWith(META_PREFIX)) {
        reloadFromStorage();
      }
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshStatuses() {
    if (!items || items.length === 0) return;

    setLoadingStatus(true);
    try {
      const results = await mapLimit(
        items,
        6, // concurrency limit
        async (it): Promise<Partial<HostItem> & { code: string }> => {
          try {
            const res = await fetch(`/api/groups/${it.code}/status?k=${it.token}`, {
              cache: "no-store",
            });
            const json = (await res.json()) as StatusResponse;

            if (!res.ok || hasError(json)) {
              return { code: it.code, error: hasError(json) ? json.error : "No access" };
            }

            return {
              code: it.code,
              title: json.group.title,
              voted: json.counts.voted,
              totalInvites: json.counts.totalInvites,
              maxMembers: json.group.maxMembers,
              revealAt: json.group.revealAt,
              canReveal: json.canReveal,
              error: undefined,
            };
          } catch {
            return { code: it.code, error: "Network error" };
          }
        }
      );

      setItems((prev) => {
        if (!prev) return prev;
        return prev.map((p) => {
          const r = results.find((x) => x.code === p.code);
          return r ? { ...p, ...r } : p;
        });
      });
    } finally {
      setLoadingStatus(false);
    }
  }

  // auto-refresh statuses once after initial load
  useEffect(() => {
    if (!items) return;
    if (items.length === 0) return;
    refreshStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items?.length]);

  function forget(code: string) {
    if (typeof window === "undefined") return;
    localStorage.removeItem(`${TOKEN_PREFIX}${code}`);
    localStorage.removeItem(`${META_PREFIX}${code}`);
    reloadFromStorage();
  }

  function openHost(it: HostItem) {
    // IMPORTANT: do NOT include token in URL
    router.push(`/host/${it.code}`);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">My groups</h1>
            <p className="text-neutral-400 text-sm">
              Groups for which this device holds an admin token.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                reloadFromStorage();
                // fetch statuses for whatever is currently in storage
                // (refreshStatuses uses current state; give it a tick)
                setTimeout(() => refreshStatuses(), 0);
              }}
              disabled={items === null || loadingStatus}
              className="rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60"
            >
              {loadingStatus ? "Refreshing..." : "Refresh"}
            </button>

            <Link
              href="/host/new"
              className="inline-flex items-center rounded-md bg-yellow-500 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-400"
            >
              Create
            </Link>
          </div>
        </div>

        {items === null ? (
          <div className="text-sm text-neutral-400">Loading…</div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 p-4 space-y-2">
            <div className="text-sm text-neutral-400">No host tokens found on this device.</div>
            <Link
              href="/host/new"
              className="inline-flex items-center rounded-md bg-yellow-500 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-400"
            >
              Create a group
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it) => {
              const revealed = !!it.revealAt;
              const voted = it.voted ?? 0;
              const max = it.maxMembers ?? 0;
              const threshold = Math.ceil(max / 2);

              return (
                <div
                  key={it.code}
                  className="rounded-xl border border-neutral-800 p-4 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium truncate">
                        {it.title ? it.title : it.code}
                      </div>

                      {revealed ? (
                        <span className="text-xs rounded-full border border-neutral-700 px-2 py-0.5 text-neutral-300">
                          Revealed
                        </span>
                      ) : it.canReveal ? (
                        <span className="text-xs rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-yellow-200">
                          Ready to reveal
                        </span>
                      ) : (
                        <span className="text-xs rounded-full border border-neutral-700 px-2 py-0.5 text-neutral-400">
                          Voting open
                        </span>
                      )}
                    </div>

                    <div className="mt-1 text-sm text-neutral-400">
                      Code: <span className="font-mono">{it.code}</span>
                    </div>

                    <div className="mt-1 text-sm text-neutral-300">
                        Progress:{" "}
                        <span className="font-mono">
                            {voted} / {max || "—"}
                        </span>

                        {!revealed && max > 0 && !it.canReveal && (
                            <span className="ml-2 text-xs text-neutral-400">
                            (Need ≥ <span className="font-mono">{threshold}</span> to reveal)
                            </span>
                        )}

                        {!revealed && max > 0 && it.canReveal && (
                            <span className="ml-2 text-xs text-yellow-200">
                            (Ready)
                            </span>
                        )}
                        </div>

                    {/* lastOpenedAt intentionally hidden from list UI */}

                    {it.error ? (
                      <div className="mt-2 text-xs text-red-300">{it.error}</div>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <button
                      onClick={() => openHost(it)}
                      className="rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
                    >
                      Open
                    </button>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setRemoveTarget(it)}
                          className="rounded-md bg-neutral-900 px-3 py-2 text-sm border border-neutral-800 hover:bg-neutral-800"
                        >
                          Remove
                        </button>
                      </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Remove confirmation modal */}
        {removeTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70"
              onClick={() => setRemoveTarget(null)}
            />
            <div className="relative w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-950 p-5 shadow-xl">
              <h3 className="text-lg font-semibold">Remove group from this device?</h3>

              <p className="mt-2 text-sm text-neutral-300">
                This will remove this group from “My groups” on this device. The group will not be deleted. You can still access it later if you have the admin link.
              </p>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setRemoveTarget(null)}
                  className="rounded-md bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
                >
                  Cancel
                </button>

                <button
                  onClick={() => {
                    forget(removeTarget.code);
                    setRemoveTarget(null);
                  }}
                  className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium hover:bg-red-500"
                >
                  Yes, remove
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="text-sm text-neutral-500">
          <Link href="/" className="underline hover:text-neutral-300">
            Back
          </Link>
        </div>
      </div>
    </main>
  );
}