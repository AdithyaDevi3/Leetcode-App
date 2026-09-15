import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminAccessDenied } from '@/components/admin/admin-access-denied';
import { AdminShell } from '@/components/admin/admin-shell';
import { getAdministrationAccess } from '@/lib/admin/authorization';

export const metadata: Metadata = { title: 'Administration — Method' };
export const dynamic = 'force-dynamic';

export default async function AdministrationLayout({ children }: { children: React.ReactNode }) {
  const access = await getAdministrationAccess();
  if (access.status === 'unauthenticated') redirect('/auth?next=%2Fadmin');
  if (access.status === 'forbidden') return <AdminAccessDenied />;
  return <AdminShell principal={access.principal}>{children}</AdminShell>;
}
