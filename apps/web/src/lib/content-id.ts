const persistedContentIds: Record<string, string> = {
  'pair-with-target-v1': '20000000-0000-0000-0000-000000000001',
  'max-window-sum-v1': '20000000-0000-0000-0000-000000000002',
  'tree-max-depth-v1': '20000000-0000-0000-0000-000000000003',
  'balanced-brackets-v1': '20000000-0000-0000-0000-000000000004',
  'climb-stairs-v1': '20000000-0000-0000-0000-000000000005',
  'island-count-v1': '20000000-0000-0000-0000-000000000006',
  'task-order-v1': '20000000-0000-0000-0000-000000000007',
  'two-sum-window-v1': '20000000-0000-0000-0000-000000000008',
  'coin-change-lite-v1': '20000000-0000-0000-0000-000000000009',
  'first-unique-index-v1': '20000000-0000-0000-0000-000000000010',
};

export const toPersistedContentId = (contentId: string): string => persistedContentIds[contentId] ?? contentId;
