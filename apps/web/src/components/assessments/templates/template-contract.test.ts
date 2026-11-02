import { describe, expect, it } from 'vitest';
import type { TemplateDetailResponse, TemplateMutationResponse, TemplateView } from '@/lib/assessment-template-api-types';
import { validContent, validCreateCommand, validDetail, validDraftReceipt, validEditCommand, validLibrary, validMutation, validTemplate, validUseCommand } from './template-contract';
import { formSignature, templateContent, templateForm } from './template-form';

const actorId = '11111111-1111-4111-8111-111111111111';
const templateId = '66666666-6666-4666-8666-666666666666';
const classId = '33333333-3333-4333-8333-333333333333';
const draftId = '55555555-5555-4555-8555-555555555555';
const date = '2026-11-01T12:00:00.000Z';
const template = (): TemplateView => ({ id: templateId, revision: 3, status: 'active', currentVersion: 2, version: 1,
  title: 'Synthetic private template', instructions: '', maxUnits: 125, createdAt: date, updatedAt: date, versionCreatedAt: date,
  questions: [{ questionVersionId: 'synthetic-template-item@1', maxUnits: 125, question: { questionId: 'synthetic-template-item', version: 1, versionId: 'synthetic-template-item@1', kind: 'multiple_choice', title: 'Synthetic question', prompt: 'Choose the synthetic invariant.', difficulty: 'foundation', activityIds: ['synthetic-practice'], conceptIds: ['hash-maps'], options: [{ id: 'a', text: 'One synthetic statement.' }, { id: 'b', text: 'Another synthetic statement.' }] } }] });
const detail = (): TemplateDetailResponse => ({ actorId, template: template(), catalog: [template().questions[0].question!], destinations: [{ id: classId, name: 'Synthetic class' }] });

describe('private template DTO and recovery boundaries', () => {
  it('accepts consistent historical versions and explicit unavailable items without inventing replacements', () => {
    expect(validTemplate(template(), templateId)).toBe(true);
    const value = detail(); value.template.questions[0].question = null; value.catalog = [];
    expect(validDetail(value, actorId, templateId)).toBe(true);
  });
  it('rejects private fields at every nested projection boundary', () => {
    const changes = [
      (value: TemplateDetailResponse) => Object.assign(value, { learnerId: draftId }),
      (value: TemplateDetailResponse) => Object.assign(value.template, { ownerId: actorId }),
      (value: TemplateDetailResponse) => Object.assign(value.template.questions[0], { answer: 'synthetic private response' }),
      (value: TemplateDetailResponse) => Object.assign(value.template.questions[0].question!, { correctOptionId: 'a' }),
      (value: TemplateDetailResponse) => Object.assign(value.catalog[0].options[0], { misconceptionTags: ['synthetic-error'] }),
      (value: TemplateDetailResponse) => Object.assign(value.destinations[0], { joinCode: 'SYNTHETIC' }),
    ];
    for (const change of changes) { const value = detail(); change(value); expect(validDetail(value, actorId, templateId)).toBe(false); }
  });
  it('binds actor/template identities and rejects inconsistent points, versions and duplicate options', () => {
    expect(validDetail(detail(), draftId, templateId)).toBe(false);
    expect(validDetail(detail(), actorId, draftId)).toBe(false);
    const value = template(); value.maxUnits++; expect(validTemplate(value)).toBe(false);
    value.maxUnits--; value.currentVersion = 4; expect(validTemplate(value)).toBe(false);
    value.currentVersion = 2; value.questions[0].question!.options[1].id = 'a'; expect(validTemplate(value)).toBe(false);
  });
  it('rejects two versions of one logical question in both previews and editable content', () => {
    const value = template(), duplicate = structuredClone(value.questions[0]);
    duplicate.questionVersionId = 'synthetic-template-item@2';
    duplicate.question!.version = 2; duplicate.question!.versionId = duplicate.questionVersionId;
    value.questions.push(duplicate); value.maxUnits = 250;
    expect(validTemplate(value)).toBe(false);
    const content = { title: value.title, instructions: value.instructions, questions: value.questions.map(item => ({ questionVersionId: item.questionVersionId, maxUnits: item.maxUnits })) };
    expect(validContent(content)).toBe(false);
    expect(() => templateContent(templateForm(value))).toThrow('Each logical question can appear only once');
  });
  it('bounds library pages and checks duplicate identities and private summary fields', () => {
    const item = { id: templateId, revision: 3, status: 'active', currentVersion: 2, title: 'Synthetic template', questionCount: 1, maxUnits: 125, updatedAt: date };
    const library = { actorId, items: [item], total: 1, page: 1, pageSize: 20 };
    expect(validLibrary(library, actorId, 1)).toBe(true);
    expect(validLibrary(library, actorId, 2)).toBe(false);
    expect(validLibrary({ ...library, items: [item, item], total: 2 }, actorId)).toBe(false);
    expect(validLibrary({ ...library, items: [{ ...item, questions: [] }] }, actorId)).toBe(false);
    expect(validLibrary({ ...library, items: Array.from({ length: 21 }, () => item), total: 21 }, actorId)).toBe(false);
  });
  it('allows original mutation receipts below current revision while rejecting wrong owners and destinations', () => {
    const receipt: TemplateMutationResponse = { actorId, template: template(), currentRevision: 4 };
    expect(validMutation(receipt, actorId, templateId)).toBe(true);
    expect(validMutation({ ...receipt, currentRevision: 2 }, actorId)).toBe(false);
    expect(validMutation(receipt, draftId)).toBe(false);
    expect(validDraftReceipt({ actorId, draftId, classId }, actorId, classId)).toBe(true);
    expect(validDraftReceipt({ actorId, draftId, classId }, actorId, templateId)).toBe(false);
  });
  it('keeps command ownership/scopes explicit and rejects injected audience/content fields', () => {
    const base = { expectedRevision: 3, requestKey: 'synthetic-template-request' };
    const create = { ...base, operation: 'create_from_draft', sourceClassId: classId, sourceDraftId: draftId };
    expect(validCreateCommand(create, classId, draftId)).toBe(true);
    expect(validCreateCommand({ ...create, audience: [] }, classId, draftId)).toBe(false);
    const content = { title: 'Synthetic template', instructions: '', questions: [{ questionVersionId: 'synthetic-template-item@1', maxUnits: 125 }] };
    expect(validContent(content)).toBe(true);
    expect(validEditCommand({ ...base, operation: 'update', content })).toBe(true);
    expect(validEditCommand({ ...base, operation: 'set_archived', archived: true })).toBe(true);
    expect(validEditCommand({ ...base, operation: 'update', content: { ...content, classId } })).toBe(false);
    expect(validUseCommand({ ...base, version: 1, destinationClassId: classId })).toBe(true);
    expect(validUseCommand({ ...base, version: 1, destinationClassId: classId, availableAt: date })).toBe(false);
  });
  it('round-trips exact points without retaining private question objects or schedules', () => {
    const form = templateForm(template());
    expect(form.questions).toEqual([{ questionVersionId: 'synthetic-template-item@1', points: '1.25' }]);
    expect(templateContent(form)).toEqual({ title: template().title, instructions: '', questions: [{ questionVersionId: 'synthetic-template-item@1', maxUnits: 125 }] });
    expect(formSignature({ ...form, title: '' })).toContain('invalid:');
    expect(() => templateContent({ ...form, questions: [{ ...form.questions[0], points: '1.001' }] })).toThrow();
  });
});
