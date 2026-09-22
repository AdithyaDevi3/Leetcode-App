import Link from 'next/link';
import { AdminMetric, AdminPageHeader, AdminSection } from '@/components/admin/admin-ui';

export default function AdminPreviewPage() {
  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Operator workspace" title="Administration overview" description="Manage classes, follow learner progress, and keep practice running smoothly." />
    <section aria-label="Sample administration metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <AdminMetric label="Learners" value={32} note="Across two sample classes" />
      <AdminMetric label="Active practice" value={12} note="Sample sessions in progress" />
      <AdminMetric label="Open feedback" value={3} note="Sample learner requests" />
      <AdminMetric label="Evaluation appeals" value={0} note="No sample appeals pending" />
    </section>
    <AdminSection title="Classes and assignments" description="Create a class, share a join code, and organize practice for your learners.">
      <div className="p-6"><Link className="button inline-flex" href="/admin-preview/classes">Manage sample classes →</Link></div>
    </AdminSection>
  </div>;
}
