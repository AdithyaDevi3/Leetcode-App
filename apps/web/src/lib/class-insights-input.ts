import { assessmentUuid } from './assessment-draft-input';
import type { ClassInsightsWorkspace } from './class-insights-api-types';

export class ClassInsightsInputError extends Error {}
export function classInsightsId(value: string): string {
  if (typeof value !== 'string' || !assessmentUuid.test(value)) throw new ClassInsightsInputError();
  return value.toLowerCase();
}
export function classInsightsWorkspace(value: unknown): ClassInsightsWorkspace {
  if (value !== 'teach' && value !== 'admin') throw new ClassInsightsInputError();
  return value;
}
/** Only public curriculum identifiers may enter a follow-up URL. */
export function classInsightsFocus(value: unknown, conceptIds: readonly string[]): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length > 242) throw new ClassInsightsInputError();
  const focus = value.split(',');
  if (focus.length < 1 || focus.length > 3 || new Set(focus).size !== focus.length
    || focus.some(id => !/^[a-z][a-z0-9-]{1,79}$/.test(id) || !conceptIds.includes(id))) throw new ClassInsightsInputError();
  return focus.sort();
}
export function classInsightsQuery(request: Request, conceptIds: readonly string[]) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => !['workspace', 'focus'].includes(key)) || params.getAll('workspace').length !== 1 || params.getAll('focus').length > 1) throw new ClassInsightsInputError();
  return { workspace: classInsightsWorkspace(params.get('workspace')), focus: classInsightsFocus(params.get('focus'), conceptIds) };
}
