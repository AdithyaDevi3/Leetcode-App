import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { createDatabaseClient, databaseConfigFromEnv } from '@leetcode-app/database';

/**
 * DELETE /api/sessions/[sessionId]
 * 
 * Revoke (delete) a specific session
 * Allows users to sign out from other devices
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const session = await requireAuth();
    const userId = session.user.id;
    const { sessionId } = await params;
    
    const db = createDatabaseClient(databaseConfigFromEnv());
    
    try {
      // Verify the session belongs to the current user
      const checkResult = await db.query<{ user_id: string }>(
        `SELECT user_id FROM sessions WHERE id = $1`,
        [sessionId]
      );
      
      if (checkResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        );
      }
      
      if (checkResult.rows[0].user_id !== userId) {
        return NextResponse.json(
          { error: 'Forbidden: Cannot revoke another user\'s session' },
          { status: 403 }
        );
      }
      
      // Delete the session
      await db.query(
        `DELETE FROM sessions WHERE id = $1`,
        [sessionId]
      );
      
      return NextResponse.json({ success: true });
    } finally {
      await db.close();
    }
  } catch (error) {
    console.error('Error revoking session:', error);
    
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to revoke session' },
      { status: 500 }
    );
  }
}
