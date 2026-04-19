import type { Prisma } from "@prisma/client";

/**
 * List-view Task selector.
 *
 * `Task.resultAttachment` holds a base64-encoded photo or PDF (up to ~2.8 MB).
 * Pulling it into every list query — the task board, the inbox panel, the
 * marketplace — would bloat the response and the Prisma cache. This selector
 * pulls every scalar column EXCEPT the attachment blob, plus a boolean-ish
 * `resultAttachmentType` so the UI can still render "📎 photo" / "📎 pdf"
 * chips without decoding the blob. Detail routes (`/api/tasks/[id]`) keep
 * using the default scalar select so the single row it returns is complete.
 */
export const TASK_LIST_SELECT: Prisma.TaskSelect = {
  id: true,
  description: true,
  bounty: true,
  bountyMicroUsd: true,
  skill: true,
  payload: true,
  status: true,
  postedBy: true,
  claimedBy: true,
  result: true,
  // Attachment blob intentionally NOT selected for list views.
  resultAttachmentType: true,
  assignedTo: true,
  requiredSkill: true,
  minReputation: true,
  expertOnly: true,
  visibility: true,
  posterRating: true,
  posterRatedAt: true,
  escrowTransactionId: true,
  payoutTxHash: true,
  payoutBlockNumber: true,
  cancelledAt: true,
  createdAt: true,
  claimedAt: true,
  completedAt: true,
};
