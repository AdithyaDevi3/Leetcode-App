import type { LearnerClassGrades } from '@leetcode-app/database';
import { createDatabaseClient, databaseConfigFromEnv, GradebookAccessError, PostgresGradebookRepository } from '@leetcode-app/database';
import { notFound, redirect } from 'next/navigation';

import { getSession } from '@/lib/auth/session';
import { LearnerClassGradesView } from './learner-class-grades-view';

export default async function LearnerClassGradesPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classId)) notFound();
  const session = await getSession();
  if (!session) redirect(`/auth?next=${encodeURIComponent(`/classes/${classId}/grades`)}`);
  const db = createDatabaseClient(databaseConfigFromEnv());
  let grades: LearnerClassGrades;
  try { grades = await new PostgresGradebookRepository(db, { role: 'learner', userId: session.user.id }).readLearnerClassGrades(classId); }
  catch (error) { if (error instanceof GradebookAccessError) notFound(); throw error; }
  finally { await db.close(); }

  return <LearnerClassGradesView grades={grades} />;
}
