import { WrittenAuthorPage } from '@/components/assessments/written/written-pages';
export default async function Page({ params }: { params: Promise<{ classId: string; draftId: string }> }) {
  const { classId, draftId } = await params;
  return <WrittenAuthorPage workspace="admin" classId={classId} draftId={draftId} />;
}
