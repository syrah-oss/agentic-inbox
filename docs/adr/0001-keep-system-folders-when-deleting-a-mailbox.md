# 0001. Keep the system folders when deleting a mailbox

- **Status:** Accepted
- **Date:** 2026-10-18
- **Deciders:** syrah-oss
- **Related:** [PR #76](https://github.com/cloudflare/agentic-inbox/pull/76) (upstream), upstream issues [#1](https://github.com/cloudflare/agentic-inbox/issues/1) and [#60](https://github.com/cloudflare/agentic-inbox/issues/60), [docs/MCP-SETUP.md](../MCP-SETUP.md)

## Context

Agentic Inbox had no way to delete a mailbox: no UI control, no API. Retiring an
address meant editing R2 and Durable Object state by hand. We added an opt-in
`delete_mailbox` MCP tool (gated behind `YOLO_MODE`, off by default) that removes
a mailbox and everything in it.

A "mailbox" is spread over several places, so "everything in it" had to be
defined explicitly:

| Where | What |
| --- | --- |
| R2 | the `mailboxes/<address>.json` marker — its presence is what makes the inbound handler accept mail at all |
| R2 | attachment blobs at `attachments/<emailId>/<attachmentId>/<filename>` |
| Durable Object `MailboxDO` | SQLite tables `emails`, `attachments`, **`folders`** |
| Durable Object `EmailAgent` | persisted chat history for that mailbox |

The inbound path is `receiveEmail` → `MailboxDO.createEmail(Folders.INBOX, …)`.
Two behaviours of the existing code turned out to be decisive:

1. **The system folders are seeded by migrations, exactly once.** `folders` is
   populated by `workers/durableObject/migrations.ts` (`inbox`, `sent`, `trash`,
   `archive`, `spam`, plus `draft` added by a later migration). `applyMigrations`
   records each migration in `d1_migrations` and skips applied ones, so these
   INSERTs never run again. Nothing else creates folders automatically —
   `getFolders()` is a plain read, and `createFolder()` is only called by the
   UI for user-created folders.

2. **`createEmail()` refuses an insert whose folder does not exist.** It does not
   silently store orphaned mail; it throws:
   `createEmail: folder "inbox" not found. Ensure the folder exists before inserting an email.`
   `getEmails()` and `searchEmails()` also resolve a folder through a subquery,
   `folder_id = (SELECT id FROM folders WHERE name = ? OR id = ? LIMIT 1)`, which
   returns `NULL` and matches nothing when the row is absent.

So `folders` is not data in the same sense as mail: it is index structure that
the rest of the mailbox depends on in order to function.

## Decision

**We will not touch the `folders` table when deleting a mailbox.**

`MailboxDO.wipeMailbox()` deletes, in order: the R2 attachment blobs, the
`attachments` rows, the `emails` rows. The caller then removes the
`mailboxes/<address>.json` marker last, so a mid-way failure leaves the mailbox
visible and retryable rather than half-deleted with mail still being accepted.
`EmailAgent.wipeHistory()` clears chat history best-effort.

Folders are left exactly as they are.

## Consequences

### Good

- Deleting a mailbox cannot break it. A re-created address is immediately usable.
- No second source of truth for the folder list. The migrations remain the only
  place that defines which folders exist.
- `wipeMailbox()` is smaller: it no longer queries, deletes, or restores folders.

### Bad

- **Folder definitions outlive the mailbox.** If an address is deleted and later
  re-created, its previous folders — including custom ones — reappear. This is
  visible to the user and may be surprising. Accepted because the alternative
  loses mail.
- If a mailbox is deleted and never re-created, its folder rows sit in the
  Durable Object unreferenced. A handful of small rows; not worth the risk of
  removing them.

### Neutral

- The tool's result no longer reports `foldersDeleted` / `foldersRestored`.
- "Delete everything" is now scoped to **data** (mail, blobs, chat history), not
  structure.

## Alternatives considered

### Delete the folders, then re-seed the six system folders

Implemented first, then abandoned.

It worked, but it required hard-coding the canonical folder list a second time —
in `wipeMailbox()` as well as the migrations. If a future migration adds a
folder and nobody remembers to update the re-seed, the exact bug it was written
to prevent comes back. It also only ever repaired damage caused by deleting the
folders in the first place.

### Delete the folders and don't re-seed

Shipped briefly and was the reason this ADR exists. It is a genuine bug, not a
cosmetic one.

Verified on a live deployment by disabling the re-seed and tailing the Worker
while sending mail to a re-created address:

```
"outcome": "exception",
"message": "createEmail: folder \"inbox\" not found. Ensure the folder exists
            before inserting an email.",
  at async receiveEmail (workers/index.ts:379)
```

Every delivery failed and the message was never stored — the address silently
bounced all mail. `getEmails()` would also have listed nothing.

### Rely on `ON DELETE CASCADE`

`attachments.email_id` references `emails.id` with `ON DELETE CASCADE`, so
deleting email rows could be expected to clean up attachments. Rejected as the
mechanism of record: whether foreign keys are enforced is not guaranteed for
these tables, and the earlier `deleteEmail()` path already chose to delete
explicitly. We delete from both tables explicitly.

### Use `storage.deleteAll()` on the Durable Object

Rejected. It drops the SQLite schema itself while the instance is still live,
leaving drizzle pointing at tables that no longer exist. Deleting rows keeps the
DO valid, so re-creating the same address starts from a clean, working state.

### Delete folder *data* but keep definitions the app relies on

Not pursued — it is the same thing as keeping the rows, with extra machinery and
no benefit.

## References

- Implementation: `workers/durableObject/index.ts` (`wipeMailbox`), `workers/lib/tools.ts` (`toolDeleteMailbox`), `workers/mcp/index.ts` (`YOLO_MODE` gate)
- Folder seeding: `workers/durableObject/migrations.ts`
- Folder resolution and the insert guard: `workers/durableObject/index.ts` (`getEmails`, `searchEmails`, `createEmail`)
- Setup guide: [docs/MCP-SETUP.md](../MCP-SETUP.md)
- Template: [docs/templates/adr.md](../templates/adr.md)
