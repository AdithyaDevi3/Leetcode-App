import { ClassNavigation } from '@/components/classes/class-navigation';

export default async function AdministrationClassLayout({ children, params }: {
  children: React.ReactNode; params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  return <><div className="mb-6"><ClassNavigation classId={classId} workspace="admin" /></div>{children}</>;
}
