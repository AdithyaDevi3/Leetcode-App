export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-20 text-slate-900">
      <section className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Method is offline</p>
        <h1 className="mt-3 text-2xl font-bold">Your draft stays on this device.</h1>
        <p className="mt-3 leading-6 text-slate-600">Reconnect to save revisions and request an evaluation. You can continue editing locally in the meantime.</p>
      </section>
    </main>
  );
}
