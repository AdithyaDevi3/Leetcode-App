import { ClassNavigation } from '@/components/classes/class-navigation';

export default async function InstructorClassLayout({ children, params }: {
  children: React.ReactNode; params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  return <><div className="mx-auto mb-6 max-w-6xl"><ClassNavigation classId={classId} workspace="teach" /></div>{children}</>;
}
