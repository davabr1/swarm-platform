-- Optional photo / PDF attachment on task submissions. Data URI / base64 so
-- the MCP can fetch it back alongside the text `result` field. Mime type
-- split out so list-view queries can filter without parsing the URI prefix.
ALTER TABLE "Task" ADD COLUMN "resultAttachment" TEXT;
ALTER TABLE "Task" ADD COLUMN "resultAttachmentType" TEXT;
