import { WrittenLearnerPage } from '@/components/assessments/written/written-pages';
export default async function Page({ params }: { params: Promise<{ classId: string; recipientId: string }> }) {
  const { classId, recipientId } = await params;
  return <WrittenLearnerPage classId={classId} recipientId={recipientId} />;
}
