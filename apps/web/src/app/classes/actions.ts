'use server';

import { redirect } from 'next/navigation';
import { ClassCodeNotFoundError, PostgresClassroomRepository, createDatabaseClient, databaseConfigFromEnv } from '@leetcode-app/database';
import { getSession } from '@/lib/auth/session';
import { normalizeClassCode } from '@/lib/classroom-input';

const errorUrl = (message: string) => `/classes?error=${encodeURIComponent(message)}`;

export async function joinClassroom(formData: FormData) {
  const code = normalizeClassCode(formData.get('code'));
  if (!code) redirect(errorUrl('Enter a valid 12-character class code.'));
  const session = await getSession();
  if (!session) redirect('/auth?next=%2Fclasses');

  const db = createDatabaseClient(databaseConfigFromEnv());
  let result;
  try {
    result = await new PostgresClassroomRepository(db).joinClassByCode({ userId: session.user.id, code });
  } catch (error) {
    if (error instanceof ClassCodeNotFoundError) redirect(errorUrl(error.message));
    redirect(errorUrl('The class could not be joined. Please try again.'));
  } finally {
    await db.close();
  }
  redirect(`/classes?joined=${encodeURIComponent(result.alreadyJoined ? 'You are already in this class.' : `You joined ${result.name}.`)}`);
}
