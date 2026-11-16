export const personalStudyDocumentBucket = 'personal-study-documents';
export const maxPersonalStudyDocumentBytes = 15 * 1024 * 1024;
export const personalStudyDocumentContentTypes = Object.freeze([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
] as const);
