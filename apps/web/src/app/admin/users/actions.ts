'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { LastAdministratorError } from '@leetcode-app/database';
import { requestIdHeader } from '@/lib/request-correlation';
import { readAdministrationData } from '@/lib/admin/authorization';
import { parseAdministrationRoleUpdate } from '@/lib/admin/role-update';

const usersUrl = (kind: 'error' | 'updated', message: string) => `/admin/users?${kind}=${encodeURIComponent(message)}`;

export async function updateAdministrationRoles(formData: FormData) {
  const parsed = parseAdministrationRoleUpdate(formData);
  if (!parsed.success) redirect(usersUrl('error', parsed.message));

  const requestHeaders = await headers();
  let status: 'authorized' | 'unauthenticated' | 'forbidden';
  try {
    const access = await readAdministrationData('administration.manage', (repository, principal) => repository.replaceRoles({
      actorId: principal.id,
      targetUserId: parsed.data.targetUserId,
      roles: parsed.data.roles,
      reason: parsed.data.reason,
      requestId: requestHeaders.get(requestIdHeader),
    }));
    status = access.status;
  } catch (error) {
    const message = error instanceof LastAdministratorError
      ? error.message
      : 'The role update could not be saved.';
    redirect(usersUrl('error', message));
  }

  if (status === 'unauthenticated') redirect('/auth?next=%2Fadmin%2Fusers');
  if (status === 'forbidden') redirect(usersUrl('error', 'Administrator permission is required.'));

  revalidatePath('/admin');
  revalidatePath('/admin/users');
  redirect(usersUrl('updated', 'Roles updated and audit event recorded.'));
}
