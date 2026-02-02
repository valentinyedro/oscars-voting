import Link from "next/link";

export default function HostNewPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-3">
        <h1 className="text-3xl font-semibold">Create group</h1>
        <p className="text-neutral-600">
          Next step: form to create a group (title, max voters), then generate invite links.
        </p>
        <Link className="underline" href="/">
          Back
        </Link>
      </div>
    </main>
  );
}