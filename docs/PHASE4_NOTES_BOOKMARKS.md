# Phase 4: Notes and bookmarks API

This slice provides authenticated learner APIs only; no workspace UI is coupled to it.

- `GET`/`POST /api/learner/notes`, `PATCH`/`DELETE /api/learner/notes/:noteId`
- `GET`/`POST /api/learner/bookmarks`, `DELETE /api/learner/bookmarks/:bookmarkId`

Both resources are owned by `user_id` and reference a content item. They may optionally reference a practice session. The write query verifies that optional session belongs to the authenticated learner, so an arbitrary session ID cannot be attached to another learner's private note or bookmark. Reads, updates, and deletes include the same owner constraint and return `404` for inaccessible identifiers.

Bookmarks are idempotent for the same learner/content/session context. Two partial unique indexes preserve one content-level bookmark and one session-level bookmark without treating all `NULL` session IDs as distinct. Notes intentionally remain non-idempotent: separate observations are meaningful study records.
