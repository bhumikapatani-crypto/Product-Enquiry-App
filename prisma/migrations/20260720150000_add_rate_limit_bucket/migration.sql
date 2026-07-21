CREATE TABLE "RateLimitBucket" (
  "key" VARCHAR(64) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimitBucket_updatedAt_idx" ON "RateLimitBucket"("updatedAt");
