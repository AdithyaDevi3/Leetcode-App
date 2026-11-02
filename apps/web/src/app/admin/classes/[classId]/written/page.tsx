import { WrittenAuthorPage } from '@/components/assessments/written/written-pages';
export default async function Page({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  return <WrittenAuthorPage workspace="admin" classId={classId} />;
}
