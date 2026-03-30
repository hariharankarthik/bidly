"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 px-6 text-neutral-100">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-md text-center text-sm text-neutral-400">{error.message}</p>
        <button
          type="button"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500"
          onClick={reset}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
