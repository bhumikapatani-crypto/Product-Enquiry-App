import { z } from "zod";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { enquiryStyles as styles } from "../styles/enquiry-style-names";
import {
  getNotificationSettings,
  saveAdditionalNotificationEmails,
  saveSmtpSettings,
  testAndSaveSmtpSettings,
} from "../services/notification-settings.server";

const emailSchema = z.string().trim().email("Enter a valid email address.").max(320);
const smtpSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().min(1, "SMTP host is required.").max(255),
  port: z.coerce.number().int().min(1).max(65_535),
  secure: z.boolean(),
  username: z.string().trim().min(1, "SMTP username is required.").max(320),
  password: z.string().trim().max(512).optional(),
  fromName: z.string().trim().min(1, "Sender name is required.").max(160),
  fromEmail: emailSchema,
}).refine((value) => value.username.toLowerCase() === value.fromEmail.toLowerCase(), {
  path: ["fromEmail"],
  message: "Sender email must match the authenticated SMTP username.",
});

function parseEmails(value: FormDataEntryValue | null) {
  const candidates = String(value ?? "").split(/[\n,;]/).map((email) => email.trim().toLowerCase()).filter(Boolean);
  const unique = [...new Set(candidates)];
  if (unique.length > 10) return { emails: [], error: "Add no more than 10 additional email addresses." };
  for (const email of unique) {
    const result = emailSchema.safeParse(email);
    if (!result.success) return { emails: [], error: `${email}: ${result.error.issues[0]?.message ?? "Invalid email."}` };
  }
  return { emails: unique, error: null };
}

function parseSmtp(formData: FormData) {
  const result = smtpSchema.safeParse({
    enabled: formData.get("smtpEnabled") === "on",
    host: formData.get("smtpHost"),
    port: formData.get("smtpPort"),
    secure: formData.get("smtpSecure") === "on",
    username: formData.get("smtpUsername"),
    password: String(formData.get("smtpPassword") ?? "").trim() || undefined,
    fromName: formData.get("smtpFromName"),
    fromEmail: formData.get("smtpFromEmail"),
  });
  if (!result.success) return { data: null, error: result.error.issues[0]?.message ?? "Check the SMTP settings." };
  return { data: result.data, error: null };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  return getNotificationSettings(admin, session.shop);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  await getNotificationSettings(admin, session.shop);
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "save-recipients");

  if (intent === "save-recipients") {
    const parsed = parseEmails(formData.get("additionalEmails"));
    if (parsed.error) return { ok: false as const, section: "recipients", message: parsed.error };
    await saveAdditionalNotificationEmails(session.shop, parsed.emails);
    return { ok: true as const, section: "recipients", message: "Notification recipients saved." };
  }

  const parsed = parseSmtp(formData);
  if (!parsed.data) return { ok: false as const, section: "smtp", message: parsed.error };
  try {
    if (intent === "test-smtp") {
      await testAndSaveSmtpSettings(session.shop, parsed.data);
      return { ok: true as const, section: "smtp", message: "SMTP connection succeeded and settings were saved." };
    }
    await saveSmtpSettings(session.shop, parsed.data);
    return { ok: true as const, section: "smtp", message: "SMTP settings saved." };
  } catch (error) {
    return { ok: false as const, section: "smtp", message: error instanceof Error ? error.message : "SMTP operation failed." };
  }
};

const formatDate = (value: string | Date) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default function NotificationSettingsPage() {
  const settings = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";

  return (
    <s-page heading="Settings">
      <div className={styles.settingsGrid}>
        {result && <div className={result.ok ? styles.success : styles.error}>{result.message}</div>}

        <div className={styles.card}>
          <h2>How email notifications work</h2>
          <ol className={styles.steps}>
            <li><strong>Your Store email is automatic</strong>The app reads the admin recipient securely from Shopify.</li>
            <li><strong>Connect your email provider once</strong>Enter the SMTP details supplied by Gmail, Outlook, or your mail host. Use an App Password, never your normal mailbox password.</li>
            <li><strong>Add your team if needed</strong>Optional addresses receive a copy of every new enquiry notification.</li>
          </ol>
        </div>

        <s-section heading="Custom SMTP sender">
          <Form method="post" className={styles.settingsGrid}>
            <label className={styles.checkbox}><input type="checkbox" name="smtpEnabled" defaultChecked={settings.smtp.enabled} />Enable custom SMTP email delivery</label>
            <div className={styles.formGrid}>
              <label className={styles.field}>SMTP host<input className={styles.control} name="smtpHost" defaultValue={settings.smtp.host} placeholder="smtp.gmail.com" required /></label>
              <label className={styles.field}>SMTP port<input className={styles.control} name="smtpPort" type="number" min="1" max="65535" defaultValue={settings.smtp.port} required /></label>
              <label className={styles.checkbox}><input type="checkbox" name="smtpSecure" defaultChecked={settings.smtp.secure} />Use secure SSL/TLS connection</label>
              <span />
              <label className={styles.field}>SMTP username<input className={styles.control} name="smtpUsername" type="email" autoComplete="username" defaultValue={settings.smtp.username} placeholder="quotes@example.com" required /></label>
              <label className={styles.field}>SMTP App Password<input className={styles.control} name="smtpPassword" type="password" autoComplete="new-password" placeholder={settings.smtp.hasPassword ? "Saved - leave blank to keep it" : "Enter an App Password"} /></label>
              <label className={styles.field}>Sender name<input className={styles.control} name="smtpFromName" defaultValue={settings.smtp.fromName} placeholder="Product Quotes" required /></label>
              <label className={styles.field}>Sender email<input className={styles.control} name="smtpFromEmail" type="email" defaultValue={settings.smtp.fromEmail} placeholder="quotes@example.com" required /></label>
            </div>
            <p className={styles.help}>For security, the sender email must match the SMTP username. The password is encrypted before storage and is never shown again.</p>
            <div className={styles.actions}>
              <button className={`${styles.button} ${styles.buttonPrimary}`} name="_intent" value="save-smtp" type="submit" disabled={saving}>{saving ? "Working..." : "Save settings"}</button>
              <button className={styles.button} name="_intent" value="test-smtp" type="submit" disabled={saving}>Test connection and save</button>
            </div>
            <div className={styles.statusBox}>{settings.smtp.lastTestedAt ? `Last successful test: ${formatDate(settings.smtp.lastTestedAt)}` : "SMTP connection has not been tested yet."}{settings.smtp.lastTestError ? ` Last error: ${settings.smtp.lastTestError}` : ""}</div>
          </Form>
        </s-section>

        <s-section heading="Admin email notifications">
          <Form method="post" className={styles.settingsGrid}>
            <label className={styles.field}>Shopify Store email<input className={styles.control} value={settings.storeEmail ?? "Not configured in Shopify"} readOnly /><span className={styles.help}>Fetched automatically from Shopify Settings &gt; General. This address always receives new enquiry notifications.</span></label>
            <label className={styles.field}>Additional notification emails<textarea className={styles.control} name="additionalEmails" defaultValue={settings.additionalEmails.join("\n")} placeholder={"sales@example.com\nquotes@example.com"} /><span className={styles.help}>Optional. Enter one address per line, up to 10.</span></label>
            <div><button className={`${styles.button} ${styles.buttonPrimary}`} name="_intent" value="save-recipients" type="submit" disabled={saving}>Save recipients</button></div>
          </Form>
        </s-section>
      </div>
    </s-page>
  );
}
