import { describe, expect, it } from 'vitest';
import { normalizeClassCode, parseClassAssignment, parseClassCreation } from './classroom-input';

describe('classroom input', () => {
  it('accepts a readable code and rejects malformed or short codes', () => {
    expect(normalizeClassCode('abcdef-ghjklm')).toBe('ABCDEFGHJKLM');
    expect(normalizeClassCode('ABCDEF-GHJKL')).toBeNull();
    expect(normalizeClassCode('ABCDEF-GHJKL0')).toBeNull();
  });

  it('requires a reason for an administrative class change', () => {
    const form = new FormData();
    form.set('name', 'Algorithms 101');
    form.set('reason', 'short');
    expect(parseClassCreation(form)).toMatchObject({ success: false });
    form.set('reason', 'Fall cohort kickoff');
    expect(parseClassCreation(form)).toMatchObject({ success: true });
  });

  it('rejects unknown activities and impossible due dates', () => {
    const form = new FormData();
    form.set('classId', '20000000-0000-4000-8000-000000000001');
    form.set('activitySlug', 'not-a-practice-item');
    form.set('title', 'Week one task');
    form.set('reason', 'Week one practice task');
    expect(parseClassAssignment(form)).toMatchObject({ success: false });
    form.set('activitySlug', 'pair-with-target-v1');
    form.set('dueOn', '2026-02-30');
    expect(parseClassAssignment(form)).toMatchObject({ success: false });
    form.set('dueOn', '2026-10-01');
    expect(parseClassAssignment(form)).toMatchObject({
      success: true,
      data: { contentId: '20000000-0000-0000-0000-000000000001', dueOn: '2026-10-01' },
    });
  });
});
