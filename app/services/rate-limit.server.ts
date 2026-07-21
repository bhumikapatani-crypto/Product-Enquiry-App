import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "../db.server";

const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1_000;

type CounterRow = { count: number };

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many quote requests.");
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function clientIdentifier(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    `unknown:${request.headers.get("user-agent") ?? "unknown"}`
  );
}

export function hashClientIp(request: Request, shop: string) {
  return createHmac("sha256", process.env.SHOPIFY_API_SECRET || "development-only")
    .update(`${shop}:${clientIdentifier(request)}`)
    .digest("hex");
}

export async function enforceQuoteRateLimit(request: Request, shop: string) {
  const now = new Date();
  const resetBefore = new Date(now.getTime() - WINDOW_MS);
  const key = hashClientIp(request, shop);

  const rows = await prisma.$queryRaw<CounterRow[]>(Prisma.sql`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart", "updatedAt")
    VALUES (${key}, 1, ${now}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."windowStart" < ${resetBefore} THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimitBucket"."windowStart" < ${resetBefore} THEN ${now}
        ELSE "RateLimitBucket"."windowStart"
      END,
      "updatedAt" = ${now}
    RETURNING "count"
  `);

  if ((rows[0]?.count ?? LIMIT + 1) > LIMIT) {
    throw new RateLimitError(Math.ceil(WINDOW_MS / 1_000));
  }

  return key;
}
