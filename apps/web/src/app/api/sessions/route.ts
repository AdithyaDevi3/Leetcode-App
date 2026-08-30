import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { createDatabaseClient, databaseConfigFromEnv } from '@leetcode-app/database';

/**
 * GET /api/sessions
 * 
 * List all active sessions for the current user
 * Allows users to see where they're logged in and manage their sessions
 */
export async function GET() {
  try {
    const session = await requireAuth();
    const userId = session.user.id;
    
    const db = createDatabaseClient(databaseConfigFromEnv());
    
    try {
      const result = await db.query<{
        id: string;
        session_token: string;
        created_at: Date;
        updated_at: Date;
        expires: Date;
      }>(
        `SELECT id, session_token, created_at, updated_at, expires
         FROM sessions
         WHERE user_id = $1 AND expires > NOW()
         ORDER BY updated_at DESC`,
        [userId]
      );
      
      // Don't expose the full session token for security
      const sessions = result.rows.map(row => ({
        id: row.id,
        tokenPreview: row.session_token.substring(0, 8) + '...',
        createdAt: row.created_at.toISOString(),
        lastActive: row.updated_at.toISOString(),
        expires: row.expires.toISOString(),
        isCurrent: row.session_token === session.user.id, // Compare with current session
      }));
      
      return NextResponse.json({ sessions });
    } finally {
      await db.close();
    }
  } catch (error) {
    console.error('Error fetching sessions:', error);
    
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}
