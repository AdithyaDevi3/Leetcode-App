'use server';

import { redirect } from 'next/navigation';
import { createDatabaseClient, databaseConfigFromEnv } from '@leetcode-app/database';
import { getSession } from '@/lib/auth/session';

export async function enableInstructor() {
  const session = await getSession();
  if (!session) redirect('/auth?next=%2Fteach%2Fstart&account=instructor');
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    await db.transaction(async client => {
      const updated = await client.query("UPDATE users SET role = 'instructor' WHERE id = $1 AND role = 'learner' RETURNING id", [session.user.id]);
      if (updated.rows.length) await client.query(`INSERT INTO administration_audit_events (actor_id, action, target_type, target_id, reason)
        VALUES ($1::uuid, 'instructor.enroll', 'user', $1::text, 'User enabled their own instructor workspace')`, [session.user.id]);
    });
  } finally {
    await db.close();
  }
  redirect('/teach');
}
