-- PostgreSQL baseline for Product Enquiry & Quote Request.
-- Generated from prisma/schema.prisma; apply with `prisma migrate deploy`.

CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'QUOTED', 'CLOSED');
CREATE TYPE "EnquirySource" AS ENUM ('STOREFRONT', 'ADMIN', 'API');
CREATE TYPE "VisibilityMode" AS ENUM ('ALL_PRODUCTS', 'SELECTED_PRODUCTS', 'SELECTED_COLLECTIONS', 'TAGGED_PRODUCTS', 'DISABLED');
CREATE TYPE "ActivityType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'NOTE_ADDED', 'NOTE_UPDATED', 'NOTE_DELETED', 'EMAIL_SENT', 'EMAIL_FAILED', 'FILE_ATTACHED', 'PRODUCT_UPDATED');
CREATE TYPE "EmailKind" AS ENUM ('ADMIN_NOTIFICATION', 'CUSTOMER_CONFIRMATION', 'QUOTE');
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "isOnline" BOOLEAN NOT NULL DEFAULT false,
  "scope" TEXT,
  "expires" TIMESTAMP(3),
  "accessToken" TEXT NOT NULL,
  "userId" BIGINT,
  "firstName" TEXT,
  "lastName" TEXT,
  "email" TEXT,
  "accountOwner" BOOLEAN NOT NULL DEFAULT false,
  "locale" TEXT,
  "collaborator" BOOLEAN DEFAULT false,
  "emailVerified" BOOLEAN DEFAULT false,
  "refreshToken" TEXT,
  "refreshTokenExpires" TIMESTAMP(3),
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Shop" (
  "id" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "name" TEXT,
  "contactEmail" TEXT,
  "currencyCode" VARCHAR(3),
  "timezone" TEXT,
  "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uninstalledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopSettings" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "buttonEnabled" BOOLEAN NOT NULL DEFAULT true,
  "buttonLabel" VARCHAR(80) NOT NULL DEFAULT 'Request a quote',
  "buttonBackgroundColor" VARCHAR(7) NOT NULL DEFAULT '#111111',
  "buttonTextColor" VARCHAR(7) NOT NULL DEFAULT '#FFFFFF',
  "visibilityMode" "VisibilityMode" NOT NULL DEFAULT 'ALL_PRODUCTS',
  "visibleProductIds" TEXT[] NOT NULL,
  "visibleCollectionIds" TEXT[] NOT NULL,
  "requiredProductTags" TEXT[] NOT NULL,
  "requirePhone" BOOLEAN NOT NULL DEFAULT false,
  "requireCompany" BOOLEAN NOT NULL DEFAULT false,
  "requireMessage" BOOLEAN NOT NULL DEFAULT false,
  "requireFile" BOOLEAN NOT NULL DEFAULT false,
  "allowFileUpload" BOOLEAN NOT NULL DEFAULT true,
  "adminNotificationEmails" TEXT[] NOT NULL,
  "adminEmailSubject" VARCHAR(200) NOT NULL DEFAULT 'New quote request: {{product_title}}',
  "adminEmailBody" TEXT NOT NULL DEFAULT 'A new quote request was submitted by {{customer_name}} for {{product_title}}.',
  "customerEmailSubject" VARCHAR(200) NOT NULL DEFAULT 'We received your quote request',
  "customerEmailBody" TEXT NOT NULL DEFAULT 'Thanks {{customer_name}}. We received your request and will contact you soon.',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Enquiry" (
  "id" TEXT NOT NULL,
  "publicId" UUID NOT NULL,
  "shopId" TEXT NOT NULL,
  "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
  "source" "EnquirySource" NOT NULL DEFAULT 'STOREFRONT',
  "customerName" VARCHAR(160) NOT NULL,
  "customerEmail" VARCHAR(320) NOT NULL,
  "customerPhone" VARCHAR(40),
  "companyName" VARCHAR(160),
  "quantity" INTEGER NOT NULL,
  "message" TEXT,
  "productId" TEXT NOT NULL,
  "productHandle" VARCHAR(255),
  "productTitle" VARCHAR(255) NOT NULL,
  "productUrl" TEXT,
  "productImageUrl" TEXT,
  "variantId" TEXT,
  "variantTitle" VARCHAR(255),
  "sku" VARCHAR(255),
  "productPrice" DECIMAL(19,4),
  "currencyCode" VARCHAR(3),
  "locale" VARCHAR(35),
  "customerIpHash" VARCHAR(64),
  "userAgent" VARCHAR(512),
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Enquiry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnquiryAttachment" (
  "id" TEXT NOT NULL, "enquiryId" TEXT NOT NULL, "storageKey" TEXT NOT NULL,
  "originalName" VARCHAR(255) NOT NULL, "mimeType" VARCHAR(127) NOT NULL,
  "byteSize" INTEGER NOT NULL, "checksum" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnquiryAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnquiryNote" (
  "id" TEXT NOT NULL, "enquiryId" TEXT NOT NULL, "body" TEXT NOT NULL,
  "authorShopifyId" TEXT, "authorName" VARCHAR(160),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "deletedAt" TIMESTAMP(3),
  CONSTRAINT "EnquiryNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnquiryActivity" (
  "id" TEXT NOT NULL, "enquiryId" TEXT NOT NULL, "type" "ActivityType" NOT NULL,
  "actorShopifyId" TEXT, "actorName" VARCHAR(160), "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnquiryActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductSnapshot" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "productId" TEXT NOT NULL,
  "handle" VARCHAR(255), "title" VARCHAR(255) NOT NULL, "imageUrl" TEXT,
  "tags" TEXT[] NOT NULL, "status" VARCHAR(32), "deletedAt" TIMESTAMP(3),
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailLog" (
  "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "enquiryId" TEXT,
  "kind" "EmailKind" NOT NULL, "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "recipient" VARCHAR(320) NOT NULL, "providerMessageId" VARCHAR(255), "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookEvent" (
  "id" TEXT NOT NULL, "shopId" TEXT, "webhookId" TEXT NOT NULL, "shopDomain" TEXT NOT NULL,
  "topic" VARCHAR(100) NOT NULL, "apiVersion" VARCHAR(20), "payload" JSONB,
  "processedAt" TIMESTAMP(3), "failedAt" TIMESTAMP(3), "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Shop_domain_key" ON "Shop"("domain");
CREATE UNIQUE INDEX "ShopSettings_shopId_key" ON "ShopSettings"("shopId");
CREATE UNIQUE INDEX "Enquiry_publicId_key" ON "Enquiry"("publicId");
CREATE UNIQUE INDEX "EnquiryAttachment_storageKey_key" ON "EnquiryAttachment"("storageKey");
CREATE UNIQUE INDEX "ProductSnapshot_shopId_productId_key" ON "ProductSnapshot"("shopId", "productId");
CREATE UNIQUE INDEX "WebhookEvent_webhookId_key" ON "WebhookEvent"("webhookId");
CREATE INDEX "Session_shop_idx" ON "Session"("shop");
CREATE INDEX "Session_expires_idx" ON "Session"("expires");
CREATE INDEX "Shop_uninstalledAt_idx" ON "Shop"("uninstalledAt");
CREATE INDEX "Enquiry_shopId_createdAt_idx" ON "Enquiry"("shopId", "createdAt" DESC);
CREATE INDEX "Enquiry_shopId_status_createdAt_idx" ON "Enquiry"("shopId", "status", "createdAt" DESC);
CREATE INDEX "Enquiry_shopId_productId_idx" ON "Enquiry"("shopId", "productId");
CREATE INDEX "Enquiry_shopId_customerEmail_idx" ON "Enquiry"("shopId", "customerEmail");
CREATE INDEX "Enquiry_shopId_lastActivityAt_idx" ON "Enquiry"("shopId", "lastActivityAt" DESC);
CREATE INDEX "EnquiryAttachment_enquiryId_idx" ON "EnquiryAttachment"("enquiryId");
CREATE INDEX "EnquiryNote_enquiryId_createdAt_idx" ON "EnquiryNote"("enquiryId", "createdAt" DESC);
CREATE INDEX "EnquiryActivity_enquiryId_createdAt_idx" ON "EnquiryActivity"("enquiryId", "createdAt" DESC);
CREATE INDEX "ProductSnapshot_shopId_title_idx" ON "ProductSnapshot"("shopId", "title");
CREATE INDEX "ProductSnapshot_shopId_updatedAt_idx" ON "ProductSnapshot"("shopId", "updatedAt" DESC);
CREATE INDEX "EmailLog_shopId_createdAt_idx" ON "EmailLog"("shopId", "createdAt" DESC);
CREATE INDEX "EmailLog_enquiryId_idx" ON "EmailLog"("enquiryId");
CREATE INDEX "EmailLog_status_createdAt_idx" ON "EmailLog"("status", "createdAt");
CREATE INDEX "WebhookEvent_shopDomain_topic_createdAt_idx" ON "WebhookEvent"("shopDomain", "topic", "createdAt" DESC);
CREATE INDEX "WebhookEvent_processedAt_idx" ON "WebhookEvent"("processedAt");

ALTER TABLE "ShopSettings" ADD CONSTRAINT "ShopSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnquiryAttachment" ADD CONSTRAINT "EnquiryAttachment_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnquiryNote" ADD CONSTRAINT "EnquiryNote_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnquiryActivity" ADD CONSTRAINT "EnquiryActivity_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductSnapshot" ADD CONSTRAINT "ProductSnapshot_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
