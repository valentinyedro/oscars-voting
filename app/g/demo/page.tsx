import Link from "next/link";

export default function DemoGroupPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-3">
        <h1 className="text-3xl font-semibold">Demo group</h1>
        <p className="text-neutral-600">
          Placeholder for the guest flow. Soon: enter via invite token, pick a name, vote categories.
        </p>
        <Link className="underline" href="/">
          Back
        </Link>
      </div>
    </main>
  );
}