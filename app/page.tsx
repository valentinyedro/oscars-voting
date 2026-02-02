import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight">Oscars Voting</h1>
          <p className="text-neutral-600">
            Private Oscars ballots for groups of friends. Create a room, invite people, vote, and
            reveal results together.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/host/new"
            className="inline-flex items-center justify-center rounded-md bg-black px-5 py-3 text-white hover:opacity-90"
          >
            Create a group
          </Link>

          <Link
            href="/g/demo"
            className="inline-flex items-center justify-center rounded-md border px-5 py-3 hover:bg-neutral-50"
          >
            View demo (placeholder)
          </Link>
        </div>

        <p className="text-sm text-neutral-500">
          MVP: unique invite links, one vote per person, results revealed when everyone votes (or the
          host reveals).
        </p>
      </div>
    </main>
  );
}
