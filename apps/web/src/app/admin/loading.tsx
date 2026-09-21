export default function AdminLoading() {
  return <div aria-live="polite" className="space-y-6">
    <div className="h-24 animate-pulse rounded-xl bg-[var(--moss-soft)]" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((item) => <div className="h-32 animate-pulse rounded-xl border border-[var(--line)] bg-[var(--surface)]" key={item} />)}
    </div>
    <span className="sr-only">Loading administration data</span>
  </div>;
}
