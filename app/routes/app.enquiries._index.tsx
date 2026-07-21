import type { EnquiryStatus } from "@prisma/client";
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
  const status = statuses.includes(rawStatus as EnquiryStatus) ? (rawStatus as EnquiryStatus) : undefined;
  const rawSort = url.searchParams.get("sort");
  const sort: EnquirySort = rawSort === "oldest" || rawSort === "activity" ? rawSort : "newest";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1));
  const result = await listEnquiries({ shopDomain: session.shop, query, status, sort, page });
  return { ...result, query, status: status ?? "", sort, page };
};

export default function EnquiriesIndex() {
  const data = useLoaderData<typeof loader>();
  const counts = Object.fromEntries(data.counts.map((item) => [item.status, item.count]));
  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (data.query) params.set("q", data.query);
    if (data.status) params.set("status", data.status);
    if (data.sort !== "newest") params.set("sort", data.sort);
    params.set("page", String(page));
    return `/app/enquiries?${params}`;
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
          <span className={styles.muted}>Page {data.page} · {data.total} result{data.total === 1 ? "" : "s"}</span>
          <div>{data.page > 1 && <Link className={styles.button} to={pageHref(data.page - 1)}>Previous</Link>} {data.hasNextPage && <Link className={styles.button} to={pageHref(data.page + 1)}>Next</Link>}</div>
        </div>
      </s-section>
    </s-page>
  );
}
