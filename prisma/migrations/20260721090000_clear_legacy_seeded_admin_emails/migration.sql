-- Before the notification settings UI existed, the Shopify Store email was
-- copied into this array. Store email is now fetched live and the array is
-- reserved only for addresses explicitly added by a merchant.
UPDATE "ShopSettings"
SET "adminNotificationEmails" = ARRAY[]::TEXT[];
