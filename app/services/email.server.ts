import type { EmailKind, ShopSettings } from "@prisma/client";
import { Resend } from "resend";
import { createSmtpTransport, decryptSmtpPassword } from "./smtp-credentials.server";

type EmailMessage = { kind: EmailKind; to: string; subject: string; text: string; html: string };
export type EmailResult = EmailMessage & { success: boolean; providerMessageId?: string; error?: string };
type SmtpSettings = Pick<ShopSettings,
  "smtpEnabled" | "smtpHost" | "smtpPort" | "smtpSecure" | "smtpUsername" |
  "smtpPasswordEncrypted" | "smtpFromName" | "smtpFromEmail"
>;

const failed = (messages: EmailMessage[], error: string): EmailResult[] =>
  messages.map((message) => ({ ...message, success: false, error }));
const failureMessage = (error: unknown) => error instanceof Error ? error.message : "Email delivery failed.";

async function sendWithStoreSmtp(messages: EmailMessage[], settings: SmtpSettings): Promise<EmailResult[]> {
  if (!settings.smtpHost || !settings.smtpUsername || !settings.smtpPasswordEncrypted || !settings.smtpFromEmail) {
    return failed(messages, "Custom SMTP is enabled but its settings are incomplete.");
  }
  let password: string;
  try {
    password = decryptSmtpPassword(settings.smtpPasswordEncrypted);
  } catch (error) {
    return failed(messages, failureMessage(error));
  }
  const transport = createSmtpTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    username: settings.smtpUsername,
    password,
    fromName: settings.smtpFromName ?? "Product Quotes",
    fromEmail: settings.smtpFromEmail,
  });
  try {
    return await Promise.all(messages.map(async (message): Promise<EmailResult> => {
      try {
        const result = await transport.sendMail({
          from: { name: settings.smtpFromName ?? "Product Quotes", address: settings.smtpFromEmail ?? "" },
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
        return { ...message, success: true, providerMessageId: result.messageId };
      } catch (error) {
        return { ...message, success: false, error: failureMessage(error) };
      }
    }));
  } finally {
    transport.close();
  }
}

async function sendWithResend(messages: EmailMessage[]): Promise<EmailResult[]> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return failed(messages, "No email provider is configured for this store.");
  const resend = new Resend(apiKey);
  return Promise.all(messages.map(async (message): Promise<EmailResult> => {
    try {
      const result = await resend.emails.send({ from, to: message.to, subject: message.subject, text: message.text, html: message.html });
      if (result.error) return { ...message, success: false, error: result.error.message };
      return { ...message, success: true, providerMessageId: result.data?.id };
    } catch (error) {
      return { ...message, success: false, error: failureMessage(error) };
    }
  }));
}

export async function sendQuoteEmails(messages: EmailMessage[], settings: SmtpSettings): Promise<EmailResult[]> {
  if (!messages.length) return [];
  return settings.smtpEnabled ? sendWithStoreSmtp(messages, settings) : sendWithResend(messages);
}
