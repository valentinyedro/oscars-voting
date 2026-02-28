import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-between p-6">
      
      {/* Contenido central */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-xl text-center space-y-8">
          
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight bg-gradient-to-r from-neutral-100 via-yellow-300/70 to-neutral-100 bg-[length:200%_200%] bg-clip-text text-transparent animate-title-shift">
              Oscars Voting
            </h1>

            <p className="text-neutral-400 text-sm leading-relaxed">
              Private Oscars ballots for groups of friends.
            </p>

            <p className="text-neutral-400 text-sm leading-relaxed">
              Create a room, invite people, vote, and reveal results together.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/host/new"
              className="inline-flex items-center justify-center rounded-md bg-yellow-500 px-6 py-3 text-sm font-medium text-black hover:bg-yellow-400 transition-colors"
            >
              Create a group
            </Link>

            <Link
              href="/host"
              className="inline-flex items-center justify-center rounded-md bg-neutral-800 px-6 py-3 text-sm hover:bg-neutral-700 transition-colors"
            >
              View my groups
            </Link>
          </div>

          <div className="text-xs text-neutral-500">
            Results can be revealed once the majority has voted.
          </div>
        </div>
      </div>

      {/* Footer signature abajo */}
      <div className="flex justify-center pb-2">
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-2 text-sm">
          Built by{" "}
          <a
            href="https://twitter.com/yedrovalen"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-yellow-300 hover:text-yellow-200 transition-colors"
          >
            @yedrovalen
          </a>
        </div>
      </div>

    </main>
  );
}