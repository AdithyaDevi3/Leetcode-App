export type PracticeIdentity = { kind: 'user' | 'guest'; id: string };
export const practiceOwnerKey = (owner: PracticeIdentity) => `${owner.kind}:${owner.id}`;
export const practiceOwnerMatches = (request: Request, owner: PracticeIdentity) => {
  const expected = request.headers.get('x-practice-owner');
  return !expected || expected === practiceOwnerKey(owner);
};

export class PracticeRevisionConflict extends Error {
  constructor(public readonly currentRevisionNumber: number, public readonly code = 'revision_conflict') {
    super('Your saved work changed. Both copies are preserved; choose which to continue.');
  }
}
