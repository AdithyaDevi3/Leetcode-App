'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  DuplicateClassAssignmentError,
  InvalidClassActivityError,
} from '@leetcode-app/database';
import { readInstructorData } from '@/lib/instructor-access';
import { parseClassAssignment, parseClassCreation } from '@/lib/classroom-input';
import { requestIdHeader } from '@/lib/request-correlation';

const classesUrl = (message: string) => `/teach?error=${encodeURIComponent(message)}`;
const classUrl = (classId: string, kind: 'error' | 'created', message: string) =>
  `/teach/${classId}?${kind}=${encodeURIComponent(message)}`;

export async function createClassroom(formData: FormData) {
  formData.set('reason', 'Instructor created their own class');
  const parsed = parseClassCreation(formData);
  if (!parsed.success) redirect(classesUrl(parsed.message));
  const requestHeaders = await headers();
  let access;
  try {
    access = await readInstructorData(async (repository, principal) =>
      repository.createClass({
        ...parsed.data,
        actorId: principal.id,
        requestId: requestHeaders.get(requestIdHeader),
      }));
  } catch {
    redirect(classesUrl('The class could not be created. Please try again.'));
  }
  if (access.status === 'unauthenticated') redirect('/auth?next=%2Fteach');
  if (access.status === 'forbidden') redirect(classesUrl('Enable your instructor workspace to manage classes.'));
  redirect(classUrl(access.data.id, 'created', 'Class created. Share the code with your learners.'));
}

export async function createClassAssignment(formData: FormData) {
  formData.set('reason', 'Instructor assigned practice to their own class');
  const parsed = parseClassAssignment(formData);
  if (!parsed.success) {
    const classId = String(formData.get('classId') ?? '');
    const safeClassId = /^[0-9a-f-]{36}$/i.test(classId) ? classId : '';
    redirect(safeClassId ? classUrl(safeClassId, 'error', parsed.message) : classesUrl(parsed.message));
  }
  const requestHeaders = await headers();
  let access;
  try {
    access = await readInstructorData(async (repository, principal) =>
      repository.createAssignment({
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
  if (access.status === 'unauthenticated') redirect('/auth?next=%2Fteach');
  if (access.status === 'forbidden') redirect(classUrl(parsed.data.classId, 'error', 'Enable your instructor workspace to manage classes.'));
  redirect(classUrl(parsed.data.classId, 'created', 'Task assigned to the class.'));
}
