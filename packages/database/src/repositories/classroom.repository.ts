import { randomBytes } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import type { DatabaseClient } from '../client.js';

const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateClassCode(): string {
  return Array.from(randomBytes(12), (byte) => codeAlphabet[byte & 31]).join('');
}

export class ClassCodeNotFoundError extends Error {
  constructor() {
    super('That class code is invalid or no longer accepting learners.');
    this.name = 'ClassCodeNotFoundError';
  }
}

export class ClassroomNotFoundError extends Error {
  constructor() {
    super('Class not found.');
    this.name = 'ClassroomNotFoundError';
  }
}

export class DuplicateClassAssignmentError extends Error {
  constructor() {
    super('This practice activity is already assigned to the class.');
    this.name = 'DuplicateClassAssignmentError';
  }
}

export class InvalidClassActivityError extends Error {
  constructor() {
    super('Choose a published practice activity.');
    this.name = 'InvalidClassActivityError';
  }
}

export type ClassroomSummary = {
  id: string;
  name: string;
  description: string;
  joinCode: string;
  createdAt: string;
  learnerCount: number;
  assignmentCount: number;
};

export type ClassAssignment = {
  id: string;
  classId: string;
  title: string;
  instructions: string;
  activitySlug: string;
  dueOn: string | null;
  createdAt: string;
  completedCount: number;
};

export type ClassLearner = {
  id: string;
  displayName: string;
  email: string | null;
  joinedAt: string;
  completedCount: number;
};

export type ClassroomDetail = {
  classroom: ClassroomSummary;
  assignments: ClassAssignment[];
  learners: ClassLearner[];
};

export type StudentClassroom = {
  id: string;
  name: string;
  description: string;
  joinedAt: string;
  assignmentCount: number;
  completedCount: number;
};

export type StudentAssignment = {
  id: string;
  classId: string;
  className: string;
  title: string;
  instructions: string;
  activitySlug: string;
  dueOn: string | null;
  completed: boolean;
};

type ClassroomRow = QueryResultRow & {
  id: string;
  name: string;
  description: string;
  join_code: string;
  created_at: Date | string;
  learner_count: string;
  assignment_count: string;
};

const iso = (value: Date | string): string => new Date(value).toISOString();
const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';

const mapClassroom = (row: ClassroomRow): ClassroomSummary => ({
  id: row.id,
  name: row.name,
  description: row.description,
  joinCode: row.join_code,
  createdAt: iso(row.created_at),
  learnerCount: Number(row.learner_count),
  assignmentCount: Number(row.assignment_count),
});

export class PostgresClassroomRepository {
  constructor(private readonly db: DatabaseClient) {}

  async createClass(input: {
    name: string; description: string; actorId: string; reason: string; requestId?: string | null;
  }): Promise<ClassroomSummary> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.db.transaction(async (client) => {
          const result = await client.query<ClassroomRow>(`
            INSERT INTO classrooms (name, description, join_code, created_by)
            VALUES ($1, $2, $3, $4)
            RETURNING id, name, description, join_code, created_at,
              0::text AS learner_count, 0::text AS assignment_count
          `, [input.name, input.description, generateClassCode(), input.actorId]);
          const classroom = mapClassroom(result.rows[0]);
          await client.query(`
            INSERT INTO administration_audit_events
              (actor_id, action, target_type, target_id, reason, request_id)
            VALUES ($1, 'classes.create', 'classroom', $2, $3, $4)
          `, [input.actorId, classroom.id, input.reason, input.requestId ?? null]);
          return classroom;
        });
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === 4) throw error;
      }
    }
    throw new Error('Could not create class code.');
  }

  async listClasses(): Promise<ClassroomSummary[]> {
    const result = await this.db.query<ClassroomRow>(`
      SELECT c.id, c.name, c.description, c.join_code, c.created_at,
        (SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id = c.id) AS learner_count,
        (SELECT COUNT(*) FROM class_assignments a WHERE a.class_id = c.id) AS assignment_count
      FROM classrooms c
      WHERE c.archived_at IS NULL
      ORDER BY c.created_at DESC
      LIMIT 100
    `);
    return result.rows.map(mapClassroom);
  }

  async getClassDetail(classId: string): Promise<ClassroomDetail> {
    const classResult = await this.db.query<ClassroomRow>(`
      SELECT c.id, c.name, c.description, c.join_code, c.created_at,
        (SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id = c.id) AS learner_count,
        (SELECT COUNT(*) FROM class_assignments a WHERE a.class_id = c.id) AS assignment_count
      FROM classrooms c WHERE c.id = $1 AND c.archived_at IS NULL
    `, [classId]);
    if (!classResult.rows[0]) throw new ClassroomNotFoundError();

    const [assignmentResult, learnerResult] = await Promise.all([
      this.db.query<{
        id: string; class_id: string; title: string; instructions: string; slug: string;
        due_on: string | null; created_at: Date | string; completed_count: string;
      }>(`
        SELECT a.id, a.class_id, a.title, a.instructions, ci.slug,
          to_char(a.due_on, 'YYYY-MM-DD') AS due_on, a.created_at,
          (SELECT COUNT(*) FROM class_enrollments e
           WHERE e.class_id = a.class_id AND EXISTS (
             SELECT 1 FROM practice_sessions p
             WHERE p.user_id = e.user_id AND p.content_id = a.content_id AND p.status = 'completed'
           )) AS completed_count
        FROM class_assignments a
        JOIN content_items ci ON ci.id = a.content_id
        WHERE a.class_id = $1
        ORDER BY a.due_on ASC NULLS LAST, a.created_at DESC
      `, [classId]),
      this.db.query<{
        id: string; display_name: string; email: string | null; joined_at: Date | string; completed_count: string;
      }>(`
        SELECT u.id, u.display_name, u.email, e.joined_at,
          (SELECT COUNT(*) FROM class_assignments a
           WHERE a.class_id = e.class_id AND EXISTS (
             SELECT 1 FROM practice_sessions p
             WHERE p.user_id = e.user_id AND p.content_id = a.content_id AND p.status = 'completed'
           )) AS completed_count
        FROM class_enrollments e
        JOIN users u ON u.id = e.user_id
        WHERE e.class_id = $1
        ORDER BY e.joined_at DESC
      `, [classId]),
    ]);

    return {
      classroom: mapClassroom(classResult.rows[0]),
      assignments: assignmentResult.rows.map((row) => ({
        id: row.id,
        classId: row.class_id,
        title: row.title,
        instructions: row.instructions,
        activitySlug: row.slug,
        dueOn: row.due_on,
        createdAt: iso(row.created_at),
        completedCount: Number(row.completed_count),
      })),
      learners: learnerResult.rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        email: row.email,
        joinedAt: iso(row.joined_at),
        completedCount: Number(row.completed_count),
      })),
    };
  }

  async createAssignment(input: {
    classId: string; contentId: string; title: string; instructions: string;
    dueOn: string | null; actorId: string; reason: string; requestId?: string | null;
  }): Promise<string> {
    try {
      return await this.db.transaction(async (client) => {
        const result = await client.query<{ id: string }>(`
          INSERT INTO class_assignments (class_id, content_id, title, instructions, due_on, created_by)
          SELECT c.id, ci.id, $3, $4, $5::date, $6
          FROM classrooms c CROSS JOIN content_items ci
          WHERE c.id = $1 AND c.archived_at IS NULL
            AND ci.id = $2 AND ci.status = 'published' AND ci.type = 'problem'
          RETURNING id
        `, [input.classId, input.contentId, input.title, input.instructions, input.dueOn, input.actorId]);
        if (!result.rows[0]) throw new InvalidClassActivityError();
        await client.query(`
          INSERT INTO administration_audit_events
            (actor_id, action, target_type, target_id, reason, request_id, metadata)
          VALUES ($1, 'classes.assignments.create', 'class_assignment', $2, $3, $4,
                  jsonb_build_object('classId', $5::text))
        `, [input.actorId, result.rows[0].id, input.reason, input.requestId ?? null, input.classId]);
        return result.rows[0].id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new DuplicateClassAssignmentError();
      throw error;
    }
  }

  async joinClassByCode(input: { userId: string; code: string }): Promise<{ id: string; name: string; alreadyJoined: boolean }> {
    const classResult = await this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM classrooms WHERE join_code = $1 AND archived_at IS NULL',
      [input.code],
    );
    const classroom = classResult.rows[0];
    if (!classroom) throw new ClassCodeNotFoundError();
    const joined = await this.db.query<{ class_id: string }>(`
      INSERT INTO class_enrollments (class_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (class_id, user_id) DO NOTHING
      RETURNING class_id
    `, [classroom.id, input.userId]);
    return { id: classroom.id, name: classroom.name, alreadyJoined: joined.rows.length === 0 };
  }

  async listStudentClasses(userId: string): Promise<StudentClassroom[]> {
    const result = await this.db.query<{
      id: string; name: string; description: string; joined_at: Date | string;
      assignment_count: string; completed_count: string;
    }>(`
      SELECT c.id, c.name, c.description, e.joined_at,
        (SELECT COUNT(*) FROM class_assignments a WHERE a.class_id = c.id) AS assignment_count,
        (SELECT COUNT(*) FROM class_assignments a WHERE a.class_id = c.id AND EXISTS (
          SELECT 1 FROM practice_sessions p
          WHERE p.user_id = e.user_id AND p.content_id = a.content_id AND p.status = 'completed'
        )) AS completed_count
      FROM class_enrollments e
      JOIN classrooms c ON c.id = e.class_id
      WHERE e.user_id = $1
      ORDER BY e.joined_at DESC
    `, [userId]);
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      joinedAt: iso(row.joined_at),
      assignmentCount: Number(row.assignment_count),
      completedCount: Number(row.completed_count),
    }));
  }

  async listStudentAssignments(userId: string): Promise<StudentAssignment[]> {
    const result = await this.db.query<{
      id: string; class_id: string; class_name: string; title: string; instructions: string;
      slug: string; due_on: string | null; completed: boolean;
    }>(`
      SELECT a.id, a.class_id, c.name AS class_name, a.title, a.instructions,
        ci.slug, to_char(a.due_on, 'YYYY-MM-DD') AS due_on,
        EXISTS (
          SELECT 1 FROM practice_sessions p
          WHERE p.user_id = e.user_id AND p.content_id = a.content_id AND p.status = 'completed'
        ) AS completed
      FROM class_enrollments e
      JOIN classrooms c ON c.id = e.class_id
      JOIN class_assignments a ON a.class_id = c.id
      JOIN content_items ci ON ci.id = a.content_id
      WHERE e.user_id = $1
      ORDER BY a.due_on ASC NULLS LAST, a.created_at DESC
    `, [userId]);
    return result.rows.map((row) => ({
      id: row.id,
      classId: row.class_id,
      className: row.class_name,
      title: row.title,
      instructions: row.instructions,
      activitySlug: row.slug,
      dueOn: row.due_on,
      completed: row.completed,
    }));
  }
}
