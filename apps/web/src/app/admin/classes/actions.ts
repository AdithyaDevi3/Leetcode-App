'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  DuplicateClassAssignmentError,
  InvalidClassActivityError,
  PostgresClassroomRepository,
} from '@leetcode-app/database';
import { readAdministrationData } from '@/lib/admin/authorization';
import { parseClassAssignment, parseClassCreation } from '@/lib/classroom-input';
import { requestIdHeader } from '@/lib/request-correlation';

const classesUrl = (message: string) => `/admin/classes?error=${encodeURIComponent(message)}`;
const classUrl = (classId: string, kind: 'error' | 'created', message: string) =>
  `/admin/classes/${classId}?${kind}=${encodeURIComponent(message)}`;

export async function createClassroom(formData: FormData) {
  const parsed = parseClassCreation(formData);
  if (!parsed.success) redirect(classesUrl(parsed.message));
  const requestHeaders = await headers();
  let access;
  try {
    access = await readAdministrationData('classes.manage', async (_repository, principal, db) =>
      new PostgresClassroomRepository(db).createClass({
        ...parsed.data,
        actorId: principal.id,
        requestId: requestHeaders.get(requestIdHeader),
      }));
  } catch {
    redirect(classesUrl('The class could not be created. Please try again.'));
  }
  if (access.status === 'unauthenticated') redirect('/auth?next=%2Fadmin%2Fclasses');
  if (access.status === 'forbidden') redirect(classesUrl('Administrator permission is required.'));
  redirect(classUrl(access.data.id, 'created', 'Class created. Share the code with your learners.'));
}

export async function createClassAssignment(formData: FormData) {
  const parsed = parseClassAssignment(formData);
  if (!parsed.success) {
    const classId = String(formData.get('classId') ?? '');
    const safeClassId = /^[0-9a-f-]{36}$/i.test(classId) ? classId : '';
    redirect(safeClassId ? classUrl(safeClassId, 'error', parsed.message) : classesUrl(parsed.message));
  }
  const requestHeaders = await headers();
  let access;
  try {
    access = await readAdministrationData('classes.manage', async (_repository, principal, db) =>
      new PostgresClassroomRepository(db).createAssignment({
        ...parsed.data,
        actorId: principal.id,
        requestId: requestHeaders.get(requestIdHeader),
      }));
  } catch (error) {
    const message = error instanceof DuplicateClassAssignmentError || error instanceof InvalidClassActivityError
      ? error.message
      : 'The task could not be assigned. Please try again.';
    redirect(classUrl(parsed.data.classId, 'error', message));
  }
  if (access.status === 'unauthenticated') redirect('/auth?next=%2Fadmin%2Fclasses');
  if (access.status === 'forbidden') redirect(classUrl(parsed.data.classId, 'error', 'Administrator permission is required.'));
  redirect(classUrl(parsed.data.classId, 'created', 'Task assigned to the class.'));
}
