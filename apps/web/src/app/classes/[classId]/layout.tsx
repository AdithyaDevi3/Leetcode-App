import { ClassNavigation } from '@/components/classes/class-navigation';

export default async function LearnerClassLayout({ children, params }: {
  children: React.ReactNode; params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  return <><div className="mx-auto max-w-6xl px-5 pt-5 sm:px-8"><ClassNavigation classId={classId} workspace="learner" /></div>{children}</>;
}
