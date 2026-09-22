import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin/admin-shell';

export const dynamic = 'force-dynamic';

export default function AdminPreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <AdminShell preview principal={{ id: 'preview', email: null, displayName: 'Demo administrator', roles: ['administrator'] }}>
    <p role="status" className="mb-6 rounded-lg border border-[var(--line)] bg-[var(--moss-soft)] p-4 text-sm text-[var(--moss)]">Design preview · Sample data only. Changes reset when you reload. Sample join codes cannot enroll learners.</p>
    {children}
  </AdminShell>;
}
