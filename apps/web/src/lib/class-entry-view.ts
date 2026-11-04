import type { StudentClassroom } from '@leetcode-app/database';

/** Keep join feedback and explicit switching reachable when the only class opens directly. */
export function classEntryDestination(classes: readonly Pick<StudentClassroom, 'id'>[], notice: {
  view?: string; error?: string; joined?: string;
}): string | null {
  return classes.length === 1 && notice.view !== 'all' && !notice.error && !notice.joined
    ? `/classes/${classes[0].id}` : null;
}
