import { ActivityType, EmailDeliveryStatus, EmailKind, Prisma } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import type { QuoteRequestInput } from "../features/enquiries/quote-request.schema";
import { verifyRequestedProduct } from "./catalog.server";
import { deleteStoredAttachment, storeAttachment } from "./file-storage.server";
import { sendQuoteEmails } from "./email.server";

type CreateQuoteArgs = { admin: AdminApiContext; shopDomain: string; input: QuoteRequestInput; attachment: File | null; customerIpHash: string; userAgent: string | null };
export class RequiredFieldError extends Error {}
const renderTemplate = (template: string, values: Record<string, string>) =>
  template.replace(/{{\s*([a-z_]+)\s*}}/g, (_, key: string) => values[key] ?? "");

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);

function buildEmailHtml(heading: string, introduction: string, details: Array<[string, string]>) {
  const rows = details
    .map(([label, value]) => `<tr><td style="padding:10px 14px;color:#616a75;border-bottom:1px solid #e5e7eb;width:34%;vertical-align:top">${escapeHtml(label)}</td><td style="padding:10px 14px;color:#111827;border-bottom:1px solid #e5e7eb;vertical-align:top;white-space:pre-wrap">${escapeHtml(value || "—")}</td></tr>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827"><div style="padding:32px 12px"><div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden"><div style="padding:24px 28px;background:#111827;color:#fff"><h1 style="margin:0;font-size:24px;line-height:1.3">${escapeHtml(heading)}</h1></div><div style="padding:24px 28px"><p style="margin:0 0 20px;line-height:1.6;color:#374151">${escapeHtml(introduction)}</p><table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px">${rows}</table></div><div style="padding:16px 28px;background:#f9fafb;color:#6b7280;font-size:12px">Product Enquiry &amp; Quote Request</div></div></div></body></html>`;
}

export async function createQuoteRequest(args: CreateQuoteArgs) {
  const catalog = await verifyRequestedProduct(args.admin, args.input.productId, args.input.variantId);
  const shop = await prisma.shop.upsert({
    where: { domain: args.shopDomain },
    update: { name: catalog.shop.name, contactEmail: catalog.shop.email, currencyCode: catalog.shop.currencyCode, timezone: catalog.shop.ianaTimezone, uninstalledAt: null },
    create: { domain: args.shopDomain, name: catalog.shop.name, contactEmail: catalog.shop.email, currencyCode: catalog.shop.currencyCode, timezone: catalog.shop.ianaTimezone },
  });
  const settings = await prisma.shopSettings.upsert({
    where: { shopId: shop.id },
    update: {},
    create: { shopId: shop.id, visibleProductIds: [], visibleCollectionIds: [], requiredProductTags: [], adminNotificationEmails: catalog.shop.email ? [catalog.shop.email] : [] },
  });
  if (settings.requirePhone && !args.input.customerPhone) throw new RequiredFieldError("Phone is required.");
  if (settings.requireCompany && !args.input.companyName) throw new RequiredFieldError("Company is required.");
  if (settings.requireMessage && !args.input.message) throw new RequiredFieldError("Message is required.");

  let storedAttachment = null;
  if (settings.allowFileUpload) storedAttachment = await storeAttachment(args.attachment, shop.id);
  if (settings.requireFile && !storedAttachment) throw new RequiredFieldError("An attachment is required.");

  try {
    const enquiry = await prisma.$transaction(async (tx) => {
      const created = await tx.enquiry.create({
        data: {
          shopId: shop.id, customerName: args.input.customerName, customerEmail: args.input.customerEmail,
          customerPhone: args.input.customerPhone, companyName: args.input.companyName, quantity: args.input.quantity,
          message: args.input.message, productId: catalog.product.id, productHandle: catalog.product.handle,
          productTitle: catalog.product.title, productUrl: catalog.product.onlineStoreUrl,
          productImageUrl: catalog.variant.imageUrl, variantId: catalog.variant.id, variantTitle: catalog.variant.title,
          sku: catalog.variant.sku, productPrice: new Prisma.Decimal(catalog.variant.price),
          currencyCode: catalog.shop.currencyCode, locale: args.input.locale, customerIpHash: args.customerIpHash,
          userAgent: args.userAgent?.slice(0, 512), attachments: storedAttachment ? { create: storedAttachment } : undefined,
          activities: { create: [
            { type: ActivityType.CREATED, metadata: { source: "storefront" } },
            ...(storedAttachment ? [{ type: ActivityType.FILE_ATTACHED, metadata: { name: storedAttachment.originalName } }] : []),
          ] },
        },
        select: { id: true, publicId: true, productTitle: true },
      });
      await tx.productSnapshot.upsert({
        where: { shopId_productId: { shopId: shop.id, productId: catalog.product.id } },
        update: { handle: catalog.product.handle, title: catalog.product.title, imageUrl: catalog.variant.imageUrl, syncedAt: new Date(), deletedAt: null },
        create: { shopId: shop.id, productId: catalog.product.id, handle: catalog.product.handle, title: catalog.product.title, imageUrl: catalog.variant.imageUrl, tags: [] },
      });
      return created;
    });

    const values = { customer_name: args.input.customerName, product_title: catalog.product.title, quantity: String(args.input.quantity), enquiry_id: enquiry.publicId };
    const details: Array<[string, string]> = [
      ["Reference", enquiry.publicId],
      ["Customer name", args.input.customerName],
      ["Customer email", args.input.customerEmail],
      ["Phone", args.input.customerPhone ?? "Not provided"],
      ["Company", args.input.companyName ?? "Not provided"],
      ["Product", catalog.product.title],
      ["Variant", catalog.variant.title],
      ["SKU", catalog.variant.sku ?? "Not available"],
      ["Quantity", String(args.input.quantity)],
      ["Message", args.input.message ?? "No message provided"],
      ["Attachment", storedAttachment?.originalName ?? "No attachment"],
    ];
    const detailsText = details.map(([label, value]) => `${label}: ${value}`).join("\n");
    const recipients = settings.adminNotificationEmails.length ? settings.adminNotificationEmails : catalog.shop.email ? [catalog.shop.email] : [];
    const results = await sendQuoteEmails([
      ...recipients.map((to) => ({
        kind: EmailKind.ADMIN_NOTIFICATION,
        to,
        subject: renderTemplate(settings.adminEmailSubject, values),
        text: `${renderTemplate(settings.adminEmailBody, values)}\n\n${detailsText}`,
        html: buildEmailHtml("New quote request", "A customer submitted the following quote request.", details),
      })),
      {
        kind: EmailKind.CUSTOMER_CONFIRMATION,
        to: args.input.customerEmail,
        subject: renderTemplate(settings.customerEmailSubject, values),
        text: `${renderTemplate(settings.customerEmailBody, values)}\n\n${detailsText}`,
        html: buildEmailHtml("We received your quote request", `Thanks ${args.input.customerName}. We will review your request and contact you soon.`, details),
      },
    ]);
    if (results.length) {
      await prisma.$transaction([
        prisma.emailLog.createMany({ data: results.map((result) => ({ shopId: shop.id, enquiryId: enquiry.id, kind: result.kind, status: result.success ? EmailDeliveryStatus.SENT : EmailDeliveryStatus.FAILED, recipient: result.to, providerMessageId: result.providerMessageId, errorMessage: result.error?.slice(0, 2_000), sentAt: result.success ? new Date() : null })) }),
        prisma.enquiryActivity.createMany({ data: results.map((result) => ({ enquiryId: enquiry.id, type: result.success ? ActivityType.EMAIL_SENT : ActivityType.EMAIL_FAILED, metadata: { kind: result.kind, recipient: result.to } })) }),
      ]);
    }
    return enquiry;
  } catch (error) {
    if (storedAttachment) await deleteStoredAttachment(storedAttachment.storageKey).catch(() => undefined);
    throw error;
  }
}
