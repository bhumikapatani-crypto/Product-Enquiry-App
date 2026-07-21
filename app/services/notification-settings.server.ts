import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { decryptSmtpPassword, encryptSmtpPassword, verifySmtpConfiguration, type SmtpConfiguration } from "./smtp-credentials.server";

export type SmtpSettingsInput = Omit<SmtpConfiguration, "password"> & {
  enabled: boolean;
  password?: string;
};

type ShopQuery = {
  data?: { shop?: { name: string; email: string | null } };
  errors?: Array<{ message: string }>;
};

async function fetchCurrentShop(admin: AdminApiContext) {
  const response = await admin.graphql(`#graphql
    query NotificationSettingsShop {
      shop {
        name
        email
      }
    }
  `);
  const payload = (await response.json()) as ShopQuery;
  const shop = payload.data?.shop;
  if (!shop) throw new Error(payload.errors?.[0]?.message ?? "Could not load the Shopify store email.");
  return shop;
}

export async function getNotificationSettings(admin: AdminApiContext, shopDomain: string) {
  const currentShop = await fetchCurrentShop(admin);
  const shop = await prisma.shop.upsert({
    where: { domain: shopDomain },
    update: { name: currentShop.name, contactEmail: currentShop.email },
    create: { domain: shopDomain, name: currentShop.name, contactEmail: currentShop.email },
  });
  const settings = await prisma.shopSettings.upsert({
    where: { shopId: shop.id },
    update: {},
    create: {
      shopId: shop.id,
      visibleProductIds: [],
      visibleCollectionIds: [],
      requiredProductTags: [],
      adminNotificationEmails: [],
    },
  });
  return {
    storeName: currentShop.name,
    storeEmail: currentShop.email,
    additionalEmails: settings.adminNotificationEmails,
    smtp: {
      enabled: settings.smtpEnabled,
      host: settings.smtpHost ?? "smtp.gmail.com",
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      username: settings.smtpUsername ?? "",
      fromName: settings.smtpFromName ?? currentShop.name,
      fromEmail: settings.smtpFromEmail ?? "",
      hasPassword: Boolean(settings.smtpPasswordEncrypted),
      lastTestedAt: settings.smtpLastTestedAt,
      lastTestError: settings.smtpLastTestError,
    },
  };
}

export async function saveAdditionalNotificationEmails(shopDomain: string, emails: string[]) {
  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain }, select: { id: true } });
  if (!shop) throw new Error("Shop settings are not initialized.");
  await prisma.shopSettings.update({
    where: { shopId: shop.id },
    data: { adminNotificationEmails: emails },
  });
}

async function smtpConfiguration(shopDomain: string, input: SmtpSettingsInput) {
  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
    select: { settings: { select: { smtpPasswordEncrypted: true } } },
  });
  const password = input.password?.trim()
    || (shop?.settings?.smtpPasswordEncrypted ? decryptSmtpPassword(shop.settings.smtpPasswordEncrypted) : "");
  if (!password) throw new Error("Enter an SMTP App Password before enabling or testing SMTP.");
  return { ...input, password } satisfies SmtpConfiguration & { enabled: boolean };
}

export async function saveSmtpSettings(shopDomain: string, input: SmtpSettingsInput) {
  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
    select: { id: true, settings: { select: { smtpPasswordEncrypted: true } } },
  });
  if (!shop?.settings) throw new Error("Shop settings are not initialized.");
  if (input.enabled && !input.password?.trim() && !shop.settings.smtpPasswordEncrypted) {
    throw new Error("Enter an SMTP App Password before enabling SMTP.");
  }
  await prisma.shopSettings.update({
    where: { shopId: shop.id },
    data: {
      smtpEnabled: input.enabled,
      smtpHost: input.host,
      smtpPort: input.port,
      smtpSecure: input.secure,
      smtpUsername: input.username,
      smtpFromName: input.fromName,
      smtpFromEmail: input.fromEmail,
      ...(input.password?.trim() ? { smtpPasswordEncrypted: encryptSmtpPassword(input.password.trim()) } : {}),
    },
  });
}

export async function testAndSaveSmtpSettings(shopDomain: string, input: SmtpSettingsInput) {
  try {
    const config = await smtpConfiguration(shopDomain, input);
    await verifySmtpConfiguration(config);
    await saveSmtpSettings(shopDomain, input);
    await prisma.shopSettings.update({
      where: { shopId: (await prisma.shop.findUniqueOrThrow({ where: { domain: shopDomain }, select: { id: true } })).id },
      data: { smtpLastTestedAt: new Date(), smtpLastTestError: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMTP connection failed.";
    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain }, select: { id: true } });
    if (shop) {
      await prisma.shopSettings.update({ where: { shopId: shop.id }, data: { smtpLastTestError: message.slice(0, 2_000) } }).catch(() => undefined);
    }
    throw new Error(message);
  }
}
