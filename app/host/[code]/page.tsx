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
  }

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


  useEffect(() => {
    if (!code || !storageKey) return;
    if (!adminToken) return;

    localStorage.setItem(storageKey, adminToken);

    // si la URL no tiene k, la actualizamos (solo cosmetico)
    if (!urlToken) {
        window.history.replaceState(null, "", `/host/${code}?k=${adminToken}`);
    }
  }, [code, storageKey, adminToken, urlToken]);




  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Host panel</h1>

        <div className="rounded-xl border border-neutral-800 p-4 space-y-2">
          <div>Group code: <span className="font-mono">{code}</span></div>
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
    </main>
  );
}
