import { ActivityType, EnquiryStatus, Prisma } from "@prisma/client";
import prisma from "../db.server";

const PAGE_SIZE = 20;
export type EnquirySort = "newest" | "oldest" | "activity";

export async function listEnquiries(args: { shopDomain: string; query?: string; status?: EnquiryStatus; sort: EnquirySort; page: number }) {
  const shop = await prisma.shop.findUnique({ where: { domain: args.shopDomain }, select: { id: true } });
  if (!shop) return { items: [], hasNextPage: false, total: 0, counts: [] };

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
    ...(search
      ? { OR: searchConditions }
      : {}),
  };
  const orderBy: Prisma.EnquiryOrderByWithRelationInput =
    args.sort === "oldest" ? { createdAt: "asc" } : args.sort === "activity" ? { lastActivityAt: "desc" } : { createdAt: "desc" };

  const [rows, total, counts] = await prisma.$transaction([
    prisma.enquiry.findMany({
      where, orderBy, skip: (args.page - 1) * PAGE_SIZE, take: PAGE_SIZE + 1,
      select: { id: true, publicId: true, customerName: true, customerEmail: true, productTitle: true, quantity: true, status: true, createdAt: true },
    }),
    prisma.enquiry.count({ where }),
    prisma.enquiry.groupBy({ by: ["status"], where: { shopId: shop.id }, orderBy: { status: "asc" }, _count: { _all: true } }),
  ]);
  return { items: rows.slice(0, PAGE_SIZE), hasNextPage: rows.length > PAGE_SIZE, total, counts: counts.map((item) => ({ status: item.status, count: typeof item._count === "object" ? item._count._all : 0 })) };
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
