import { ActivityType, EnquiryStatus, Prisma } from "@prisma/client";
import prisma from "../db.server";

export const ENQUIRY_PAGE_SIZE = 20;
export const MAX_EXPORT_ROWS = 10_000;
export type EnquirySort = "newest" | "oldest" | "activity";
type EnquiryQueryArgs = { shopDomain: string; query?: string; status?: EnquiryStatus; sort: EnquirySort };

async function buildEnquiryQuery(args: EnquiryQueryArgs) {
  const shop = await prisma.shop.findUnique({ where: { domain: args.shopDomain }, select: { id: true } });
  if (!shop) return null;
  const search = args.query?.trim().slice(0, 100);
  const searchConditions: Prisma.EnquiryWhereInput[] = search ? [
    { customerName: { contains: search, mode: "insensitive" } },
    { customerEmail: { contains: search, mode: "insensitive" } },
    { productTitle: { contains: search, mode: "insensitive" } },
    ...(/^[0-9a-f-]{36}$/i.test(search) ? [{ publicId: search }] : []),
  ] : [];
  const where: Prisma.EnquiryWhereInput = {
    shopId: shop.id,
    status: args.status,
    ...(search ? { OR: searchConditions } : {}),
  };
  const orderBy: Prisma.EnquiryOrderByWithRelationInput =
    args.sort === "oldest" ? { createdAt: "asc" } : args.sort === "activity" ? { lastActivityAt: "desc" } : { createdAt: "desc" };
  return { shopId: shop.id, where, orderBy };
}

export async function listEnquiries(args: EnquiryQueryArgs & { page: number }) {
  const query = await buildEnquiryQuery(args);
  if (!query) return { items: [], hasNextPage: false, total: 0, totalPages: 1, pageSize: ENQUIRY_PAGE_SIZE, counts: [] };

  const [rows, total, counts] = await prisma.$transaction([
    prisma.enquiry.findMany({
      where: query.where, orderBy: query.orderBy, skip: (args.page - 1) * ENQUIRY_PAGE_SIZE, take: ENQUIRY_PAGE_SIZE + 1,
      select: { id: true, publicId: true, customerName: true, customerEmail: true, productTitle: true, quantity: true, status: true, createdAt: true },
    }),
    prisma.enquiry.count({ where: query.where }),
    prisma.enquiry.groupBy({ by: ["status"], where: { shopId: query.shopId }, orderBy: { status: "asc" }, _count: { _all: true } }),
  ]);
  return {
    items: rows.slice(0, ENQUIRY_PAGE_SIZE),
    hasNextPage: rows.length > ENQUIRY_PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / ENQUIRY_PAGE_SIZE)),
    pageSize: ENQUIRY_PAGE_SIZE,
    counts: counts.map((item) => ({ status: item.status, count: typeof item._count === "object" ? item._count._all : 0 })),
  };
}

export async function exportEnquiries(args: EnquiryQueryArgs) {
  const query = await buildEnquiryQuery(args);
  if (!query) return [];
  return prisma.enquiry.findMany({
    where: query.where,
    orderBy: query.orderBy,
    take: MAX_EXPORT_ROWS + 1,
    select: {
      publicId: true, status: true, customerName: true, customerEmail: true, customerPhone: true,
      companyName: true, quantity: true, message: true, productTitle: true, variantTitle: true,
      sku: true, productPrice: true, currencyCode: true, createdAt: true, updatedAt: true,
      attachments: { select: { originalName: true } },
    },
  });
}

export async function getEnquiry(shopDomain: string, id: string) {
  return prisma.enquiry.findFirst({
    where: { id, shop: { domain: shopDomain } },
    include: {
      attachments: { orderBy: { createdAt: "desc" } },
      notes: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" } },
      emailLogs: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function updateEnquiryStatus(args: { shopDomain: string; id: string; status: EnquiryStatus; actorId?: string; actorName?: string }) {
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findFirst({ where: { id: args.id, shop: { domain: args.shopDomain } }, select: { id: true, status: true } });
    if (!enquiry) return null;
    if (enquiry.status === args.status) return enquiry;
    await tx.enquiry.update({ where: { id: enquiry.id }, data: { status: args.status, lastActivityAt: new Date() } });
    await tx.enquiryActivity.create({ data: { enquiryId: enquiry.id, type: ActivityType.STATUS_CHANGED, actorShopifyId: args.actorId, actorName: args.actorName, metadata: { from: enquiry.status, to: args.status } } });
    return enquiry;
  });
}

export async function addEnquiryNote(args: { shopDomain: string; id: string; body: string; actorId?: string; actorName?: string }) {
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findFirst({ where: { id: args.id, shop: { domain: args.shopDomain } }, select: { id: true } });
    if (!enquiry) return null;
    const note = await tx.enquiryNote.create({ data: { enquiryId: enquiry.id, body: args.body, authorShopifyId: args.actorId, authorName: args.actorName } });
    await tx.enquiryActivity.create({ data: { enquiryId: enquiry.id, type: ActivityType.NOTE_ADDED, actorShopifyId: args.actorId, actorName: args.actorName, metadata: { noteId: note.id } } });
    await tx.enquiry.update({ where: { id: enquiry.id }, data: { lastActivityAt: new Date() } });
    return note;
  });
}
