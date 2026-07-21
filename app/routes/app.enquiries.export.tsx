import type { EnquiryStatus } from "@prisma/client";
import ExcelJS from "exceljs";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { exportEnquiries, MAX_EXPORT_ROWS, type EnquirySort } from "../repositories/enquiry.repository.server";

const statuses = ["NEW", "CONTACTED", "QUOTED", "CLOSED"] as const satisfies readonly EnquiryStatus[];
const columns = [
  "Reference", "Status", "Received", "Customer name", "Customer email", "Phone", "Company",
  "Product", "Variant", "SKU", "Quantity", "Price", "Currency", "Message", "Attachments", "Updated",
] as const;

const safeCell = (value: unknown) => {
  const text = value == null ? "" : String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
};
const csvCell = (value: unknown) => `"${safeCell(value).replace(/"/g, '""')}"`;

function rowValues(row: Awaited<ReturnType<typeof exportEnquiries>>[number]) {
  return [
    row.publicId,
    row.status[0] + row.status.slice(1).toLowerCase(),
    row.createdAt.toISOString(),
    row.customerName,
    row.customerEmail,
    row.customerPhone,
    row.companyName,
    row.productTitle,
    row.variantTitle,
    row.sku,
    row.quantity,
    row.productPrice?.toString(),
    row.currencyCode,
    row.message,
    row.attachments.map((attachment) => attachment.originalName).join(", "),
    row.updatedAt.toISOString(),
  ].map(safeCell);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  if (format !== "csv" && format !== "xlsx") return new Response("Unsupported export format.", { status: 400 });
  const rawStatus = url.searchParams.get("status") ?? "";
  const status = statuses.includes(rawStatus as EnquiryStatus) ? rawStatus as EnquiryStatus : undefined;
  const rawSort = url.searchParams.get("sort");
  const sort: EnquirySort = rawSort === "oldest" || rawSort === "activity" ? rawSort : "newest";
  const rows = await exportEnquiries({
    shopDomain: session.shop,
    query: url.searchParams.get("q")?.slice(0, 100),
    status,
    sort,
  });
  if (rows.length > MAX_EXPORT_ROWS) {
    return new Response(`This export contains more than ${MAX_EXPORT_ROWS.toLocaleString()} rows. Narrow the filters and try again.`, { status: 422 });
  }

  const date = new Date().toISOString().slice(0, 10);
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (format === "csv") {
    const csv = `\uFEFF${[columns.map(csvCell).join(","), ...rows.map((row) => rowValues(row).map(csvCell).join(","))].join("\r\n")}`;
    return new Response(csv, {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="enquiries-${date}.csv"` },
    });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Product Enquiry & Quote Request";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Enquiries", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRow([...columns]);
  for (const row of rows) sheet.addRow(rowValues(row));
  sheet.autoFilter = { from: "A1", to: "P1" };
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF202223" } };
    cell.alignment = { vertical: "middle" };
  });
  sheet.getRow(1).height = 24;
  sheet.columns.forEach((column, index) => {
    const preferred = [38, 14, 24, 22, 30, 18, 22, 32, 22, 18, 11, 14, 11, 42, 34, 24][index] ?? 18;
    column.width = preferred;
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="enquiries-${date}.xlsx"` },
  });
};
