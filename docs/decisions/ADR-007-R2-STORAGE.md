# ADR-007 — R2 operational file storage

**Status:** Accepted

Operational binary files such as avatars, receipts, payment proofs, generated invoices/reports and attachments use R2. D1 stores metadata, ownership, MIME/size/checksum and object keys. Local/public filesystem paths are not authoritative storage.

Google Drive, if later offered, is personal export/backup storage only and not BoardOps operational storage or database.
