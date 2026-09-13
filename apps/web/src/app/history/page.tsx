import { PracticeHistory } from '@/components/practice-history';
import { SiteNavigation } from '@/components/site-navigation';

export default function HistoryPage() {
  return <main className="min-h-screen px-6 py-8 text-[var(--ink)] sm:py-12"><section className="mx-auto max-w-5xl"><SiteNavigation currentPath="/history" /><div className="mt-10 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Practice history</p><h1>Your saved reasoning</h1><p className="mt-3 max-w-2xl text-[var(--muted)]">Review session progress, saved revisions, and evaluation feedback—then decide what to practice next.</p></div><a className="button" href="/practice">Practice again</a></div><div className="mt-8"><PracticeHistory /></div></section></main>;
}
