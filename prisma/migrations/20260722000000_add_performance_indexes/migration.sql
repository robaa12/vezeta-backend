-- Performance indexes for hot read paths in appointments, users,
-- notifications, and doctors. See FINDINGS.md (PR 3 in the security
-- audit). Each index is justified by a specific query that would
-- otherwise do a sequential scan or a partial-index scan with a
-- follow-up sort.

-- CreateIndex
CREATE INDEX "user_role_isActive_idx" ON "user"("role", "isActive");
CREATE INDEX "user_isActive_idx" ON "user"("isActive");

-- CreateIndex
CREATE INDEX "appointment_userId_status_scheduledAt_idx" ON "appointment"("userId", "status", "scheduledAt");
CREATE INDEX "appointment_doctorId_status_scheduledAt_idx" ON "appointment"("doctorId", "status", "scheduledAt");
CREATE INDEX "appointment_status_scheduledAt_idx" ON "appointment"("status", "scheduledAt");

-- Functional GIN index on notification.metadata. Prisma's schema
-- language does not support functional/gin indexes natively, so it
-- is declared here in raw SQL.
CREATE INDEX "notification_metadata_gin" ON "notification" USING gin ("metadata" jsonb_path_ops);
