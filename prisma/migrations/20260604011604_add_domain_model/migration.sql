-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "defaultDomain" TEXT;

-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "domains_domain_key" ON "domains"("domain");

-- CreateIndex
CREATE INDEX "domains_workspaceId_idx" ON "domains"("workspaceId");

DO $$
BEGIN
    IF to_regclass('public.custom_domains') IS NOT NULL THEN
        INSERT INTO "domains" ("id", "domain", "workspaceId", "createdAt")
        SELECT "id", "domain", "workspaceId", "createdAt"
        FROM "custom_domains"
        ON CONFLICT ("domain") DO NOTHING;
    END IF;
END $$;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
