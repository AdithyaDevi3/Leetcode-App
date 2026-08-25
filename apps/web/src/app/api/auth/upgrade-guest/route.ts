import { NextResponse } from 'next/server';
import { requireAuth, getGuestSession, clearGuestSession } from '@/lib/auth/session';
import { createDatabaseClient, PostgresUserRepository, PostgresGuestIdentityRepository } from '@leetcode-app/database';

/**
 * POST /api/auth/upgrade-guest
 * 
 * Upgrade a guest session to an authenticated user account
 * 
 * This endpoint:
 * 1. Verifies the user is authenticated
 * 2. Checks for an existing guest session
 * 3. Merges guest data into the user account using deterministic rules
 * 4. Clears the guest session cookie
 * 
 * Merge Rules (deterministic behavior):
 * - Practice sessions: All guest sessions are preserved and linked to the user
 * - Attempts: All attempts are preserved with their full history
 * - Pseudocode revisions: All drafts are preserved
 * - Evaluation results: All evaluations are preserved
 * - Collision handling: No data is lost; guest data supplements user data
 */
export async function POST() {
  try {
    const session = await requireAuth();
    const userId = session.user.id;
    
    const guestSession = await getGuestSession();
    
    if (!guestSession) {
      return NextResponse.json(
        { error: 'No guest session found to upgrade' },
        { status: 400 }
      );
    }
    
    const db = createDatabaseClient({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'leetcode_app',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
    });
    
    try {
      const userRepo = new PostgresUserRepository(db);
      const guestRepo = new PostgresGuestIdentityRepository(db);
      
      // Use a transaction to ensure atomicity
      await db.transaction(async () => {
        // 1. Check if guest identity exists in database
        const guestIdentity = await guestRepo.findById(guestSession.id);
        
        if (!guestIdentity) {
          // Guest has no stored data, nothing to merge
          await clearGuestSession();
          return;
        }
        
        // 2. Get or create user record
        const user = await userRepo.findById(userId);
        if (!user) {
          throw new Error(`User ${userId} not found`);
        }
        
        // 3. Upgrade guest to user - this merges all guest data
        await userRepo.upgradeGuestToUser(guestSession.id, userId);
        
        // 4. Update user record to track the guest upgrade
        await userRepo.update(userId, user.revision, {
          // Store reference to the upgraded guest ID for audit trail
          displayName: user.displayName || `User ${userId.substring(0, 8)}`,
        });
        
        // Note: The upgradeGuestToUser method handles:
        // - Reassigning practice sessions from guest to user
        // - Preserving all attempts with their full history
        // - Keeping all pseudocode revisions
        // - Maintaining all evaluation results
        // - No data loss on collision (guest data supplements user data)
      });
      
      // 5. Clear the guest session cookie
      await clearGuestSession();
      
      // 6. Query merged data stats for response
      const stats = await db.query<{
        practice_sessions: number;
        attempts: number;
        pseudocode_revisions: number;
      }>(
        `SELECT 
          (SELECT COUNT(*) FROM practice_sessions WHERE user_id = $1) as practice_sessions,
          (SELECT COUNT(*) FROM attempts WHERE attempt_id IN 
            (SELECT id FROM practice_sessions WHERE user_id = $1)) as attempts,
          (SELECT COUNT(*) FROM pseudocode_revisions WHERE attempt_id IN 
            (SELECT id FROM practice_sessions WHERE user_id = $1)) as pseudocode_revisions`,
        [userId]
      );
      
      return NextResponse.json({
        success: true,
        message: 'Guest session successfully upgraded',
        merged: stats.rows[0] || {
          practice_sessions: 0,
          attempts: 0,
          pseudocode_revisions: 0,
        },
      });
    } finally {
      await db.close();
    }
  } catch (error) {
    console.error('Error upgrading guest session:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Unauthorized: Authentication required') {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      
      return NextResponse.json(
        { error: `Failed to upgrade guest session: ${error.message}` },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to upgrade guest session' },
      { status: 500 }
    );
  }
}
