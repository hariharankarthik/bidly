export default function AppLoading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-700 border-t-emerald-500" aria-hidden />
      <p className="text-sm text-neutral-500">Loading…</p>
    </div>
  );
}
