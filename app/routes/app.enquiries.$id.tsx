import type { EnquiryStatus } from "@prisma/client";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { addEnquiryNote, getEnquiry, updateEnquiryStatus } from "../repositories/enquiry.repository.server";
import { enquiryStyles as styles } from "../styles/enquiry-style-names";

const statuses = ["NEW", "CONTACTED", "QUOTED", "CLOSED"] as const satisfies readonly EnquiryStatus[];
const formatDate = (value: string | Date) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const titleCase = (value: string) => value.toLowerCase().replace(/(^|_)([a-z])/g, (_, space, letter: string) => `${space ? " " : ""}${letter.toUpperCase()}`);

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const enquiry = await getEnquiry(session.shop, params.id ?? "");
  if (!enquiry) throw new Response("Not found", { status: 404 });
  return { enquiry };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const actorId = session.id;
  const actorName = "Shopify user";
  if (intent === "status") {
    const status = String(form.get("status") ?? "");
    if (!statuses.includes(status as EnquiryStatus)) return Response.json({ error: "Invalid status." }, { status: 422 });
    const updated = await updateEnquiryStatus({ shopDomain: session.shop, id: params.id ?? "", status: status as EnquiryStatus, actorId, actorName });
    if (!updated) throw new Response("Not found", { status: 404 });
  } else if (intent === "note") {
    const body = String(form.get("body") ?? "").normalize("NFKC").replace(/<[^>]*>/g, "").trim();
    if (!body || body.length > 5_000) return Response.json({ error: "Enter a note up to 5,000 characters." }, { status: 422 });
    const note = await addEnquiryNote({ shopDomain: session.shop, id: params.id ?? "", body, actorId, actorName });
    if (!note) throw new Response("Not found", { status: 404 });
  }
  return redirect(`/app/enquiries/${params.id}`);
};

export default function EnquiryDetail() {
  const { enquiry } = useLoaderData<typeof loader>();
  return (
    <s-page heading={`Quote request · ${enquiry.customerName}`}>
      <s-button slot="secondary-actions" href="/app/enquiries">Back to enquiries</s-button>
      <div className={styles.detailGrid}>
        <div>
          <div className={styles.card}><h2>Request details</h2><dl className={styles.details}>
            <dt>Reference</dt><dd>{enquiry.publicId}</dd><dt>Received</dt><dd>{formatDate(enquiry.createdAt)}</dd>
            <dt>Customer</dt><dd>{enquiry.customerName}</dd><dt>Email</dt><dd><a href={`mailto:${enquiry.customerEmail}`}>{enquiry.customerEmail}</a></dd>
            <dt>Phone</dt><dd>{enquiry.customerPhone || "Not provided"}</dd><dt>Company</dt><dd>{enquiry.companyName || "Not provided"}</dd>
            <dt>Quantity</dt><dd>{enquiry.quantity}</dd><dt>Message</dt><dd className={styles.message}>{enquiry.message || "No message provided"}</dd>
          </dl></div>
          <div className={styles.card}><h2>Product</h2><div className={styles.product}>{enquiry.productImageUrl && <img src={enquiry.productImageUrl} alt="" />}<div><strong>{enquiry.productTitle}</strong><div className={styles.secondary}>{enquiry.variantTitle || "Default variant"}</div><div className={styles.secondary}>SKU: {enquiry.sku || "—"}</div>{enquiry.productUrl && <a href={enquiry.productUrl} target="_blank" rel="noreferrer">View product</a>}</div></div></div>
          <div className={styles.card}><h2>Internal notes</h2><Form method="post"><input type="hidden" name="intent" value="note" /><label className={styles.field}>Add a private note<textarea className={styles.control} name="body" rows={4} maxLength={5000} required /></label><br/><button className={`${styles.button} ${styles.buttonPrimary}`} type="submit">Add note</button></Form>{enquiry.notes.map((note) => <div className={styles.note} key={note.id}><div className={styles.noteMeta}>{note.authorName || "Shopify user"} · {formatDate(note.createdAt)}</div><div className={styles.message}>{note.body}</div></div>)}</div>
        </div>
        <div>
          <div className={styles.card}><h2>Status</h2><Form method="post"><input type="hidden" name="intent" value="status" /><label className={styles.field}>Enquiry status<select className={styles.control} name="status" defaultValue={enquiry.status}>{statuses.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select></label><br/><button className={`${styles.button} ${styles.buttonPrimary}`} type="submit">Update status</button></Form></div>
          <div className={styles.card}><h2>Attachments</h2>{enquiry.attachments.length ? enquiry.attachments.map((file) => <div className={styles.note} key={file.id}><strong>{file.originalName}</strong><div className={styles.secondary}>{file.mimeType} · {Math.ceil(file.byteSize / 1024)} KB</div></div>) : <p className={styles.muted}>No attachments</p>}</div>
          <div className={styles.card}><h2>Activity</h2><ul className={styles.timeline}>{enquiry.activities.map((activity) => <li key={activity.id}><strong>{titleCase(activity.type)}</strong><div className={styles.secondary}>{activity.actorName || "System"} · {formatDate(activity.createdAt)}</div></li>)}</ul></div>
          <div className={styles.card}><h2>Email delivery</h2>{enquiry.emailLogs.map((email) => <div className={styles.note} key={email.id}><strong>{titleCase(email.kind)}</strong><div className={styles.secondary}>{email.status} · {email.recipient}</div>{email.errorMessage && <div className={styles.secondary}>{email.errorMessage}</div>}</div>)}</div>
        </div>
      </div>
    </s-page>
  );
}
