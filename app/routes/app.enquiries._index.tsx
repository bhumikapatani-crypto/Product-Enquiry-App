import type { EnquiryStatus } from "@prisma/client";
import { Fragment, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { listEnquiries, type EnquirySort } from "../repositories/enquiry.repository.server";
import { enquiryStyles as styles } from "../styles/enquiry-style-names";

const statuses = ["NEW", "CONTACTED", "QUOTED", "CLOSED"] as const satisfies readonly EnquiryStatus[];
const statusClass = (status: EnquiryStatus) => styles[status.toLowerCase() as "new" | "contacted" | "quoted" | "closed"];
const formatDate = (value: string | Date) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.slice(0, 100) ?? "";
  const rawStatus = url.searchParams.get("status") ?? "";
  const status = statuses.includes(rawStatus as EnquiryStatus) ? rawStatus as EnquiryStatus : undefined;
  const rawSort = url.searchParams.get("sort");
  const sort: EnquirySort = rawSort === "oldest" || rawSort === "activity" ? rawSort : "newest";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1));
  let result = await listEnquiries({ shopDomain: session.shop, query, status, sort, page });
  const effectivePage = Math.min(page, result.totalPages);
  if (effectivePage !== page) result = await listEnquiries({ shopDomain: session.shop, query, status, sort, page: effectivePage });
  return { ...result, query, status: status ?? "", sort, page: effectivePage };
};

export default function EnquiriesIndex() {
  const data = useLoaderData<typeof loader>();
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [exportError, setExportError] = useState("");
  const counts = Object.fromEntries(data.counts.map((item) => [item.status, item.count]));
  const filteredParams = () => {
    const params = new URLSearchParams();
    if (data.query) params.set("q", data.query);
    if (data.status) params.set("status", data.status);
    if (data.sort !== "newest") params.set("sort", data.sort);
    return params;
  };
  const pageHref = (page: number) => {
    const params = filteredParams();
    params.set("page", String(page));
    return `/app/enquiries?${params}`;
  };
  const exportHref = (format: "csv" | "xlsx") => {
    const params = filteredParams();
    params.set("format", format);
    return `/app/enquiries/export?${params}`;
  };
  const visiblePages = Array.from(new Set([1, data.totalPages, data.page - 2, data.page - 1, data.page, data.page + 1, data.page + 2]))
    .filter((page) => page >= 1 && page <= data.totalPages)
    .sort((a, b) => a - b);
  const downloadExport = async (format: "csv" | "xlsx") => {
    setExporting(format);
    setExportError("");
    try {
      // App Bridge intercepts global fetch and adds the current Shopify ID
      // token. Direct download links cannot reliably authenticate in an iframe.
      const response = await fetch(exportHref(format), { headers: { Accept: format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
      if (!response.ok) throw new Error((await response.text()).slice(0, 500) || "Export failed.");
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      const expectedType = format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      if (!contentType.includes(expectedType)) throw new Error("Shopify returned an authentication page instead of the export. Refresh the app and try again.");
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `enquiries.${format}`;
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed. Please try again.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <s-page heading="Enquiries">
      <div className={styles.stats}>
        <div className={styles.stat}><div className={styles.statLabel}>Matching enquiries</div><div className={styles.statValue}>{data.total}</div></div>
        {statuses.map((status) => <div className={styles.stat} key={status}><div className={styles.statLabel}>{status[0] + status.slice(1).toLowerCase()}</div><div className={styles.statValue}>{counts[status] ?? 0}</div></div>)}
      </div>

      <s-section heading="Customer quote requests">
        <Form method="get" className={styles.filters}>
          <label className={styles.field}>Search<input className={styles.control} name="q" defaultValue={data.query} placeholder="Name, email, product, or reference" /></label>
          <label className={styles.field}>Status<select className={styles.control} name="status" defaultValue={data.status}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status[0] + status.slice(1).toLowerCase()}</option>)}</select></label>
          <label className={styles.field}>Sort<select className={styles.control} name="sort" defaultValue={data.sort}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="activity">Recent activity</option></select></label>
          <button className={`${styles.button} ${styles.buttonPrimary}`} type="submit">Apply</button>
        </Form>

        <div className={styles.toolbar}>
          <span className={styles.muted}>Exports include all {data.total} filtered result{data.total === 1 ? "" : "s"}, not only this page.</span>
          <div className={styles.actions}>
            <button className={styles.button} type="button" disabled={Boolean(exporting)} onClick={() => void downloadExport("csv")}>{exporting === "csv" ? "Preparing CSV..." : "Export CSV"}</button>
            <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" disabled={Boolean(exporting)} onClick={() => void downloadExport("xlsx")}>{exporting === "xlsx" ? "Preparing Excel..." : "Export Excel"}</button>
          </div>
        </div>
        {exportError && <div className={styles.error} role="alert" aria-live="polite">{exportError}</div>}

        {data.items.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Customer</th><th>Product</th><th>Quantity</th><th>Status</th><th>Received</th><th></th></tr></thead>
              <tbody>{data.items.map((item) => (
                <tr key={item.id}>
                  <td><Link className={styles.primary} to={`/app/enquiries/${item.id}`}>{item.customerName}</Link><div className={styles.secondary}>{item.customerEmail}</div></td>
                  <td>{item.productTitle}</td><td>{item.quantity}</td>
                  <td><span className={`${styles.badge} ${statusClass(item.status)}`}>{item.status[0] + item.status.slice(1).toLowerCase()}</span></td>
                  <td>{formatDate(item.createdAt)}</td><td><Link to={`/app/enquiries/${item.id}`}>View</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <s-banner tone="info" heading="No enquiries found">Try changing the search or status filter.</s-banner>}

        <div className={styles.pagination}>
          <span className={styles.muted}>Page {Math.min(data.page, data.totalPages)} of {data.totalPages} · {data.total} result{data.total === 1 ? "" : "s"}</span>
          <nav className={styles.pageNumbers} aria-label="Enquiry pages">
            {data.page > 1 && <Link className={styles.button} to={pageHref(data.page - 1)}>Previous</Link>}
            {visiblePages.map((page, index) => (
              <Fragment key={page}>
                {index > 0 && page - visiblePages[index - 1] > 1 && <span className={styles.pageEllipsis}>...</span>}
                <Link className={`${styles.button} ${page === data.page ? styles.pageActive : ""}`} to={pageHref(page)} aria-current={page === data.page ? "page" : undefined}>{page}</Link>
              </Fragment>
            ))}
            {data.hasNextPage && <Link className={styles.button} to={pageHref(data.page + 1)}>Next</Link>}
          </nav>
        </div>
      </s-section>
    </s-page>
  );
}
