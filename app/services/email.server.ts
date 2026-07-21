import type { EmailKind } from "@prisma/client";
import nodemailer from "nodemailer";
import { Resend } from "resend";

type EmailMessage = {
  kind: EmailKind;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailResult = EmailMessage & {
  success: boolean;
  providerMessageId?: string;
  error?: string;
};

const failed = (messages: EmailMessage[], error: string): EmailResult[] =>
  messages.map((message) => ({ ...message, success: false, error }));

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Email delivery failed.";

async function sendWithSmtp(
  messages: EmailMessage[],
  from: string,
): Promise<EmailResult[]> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const rawPassword = process.env.SMTP_PASSWORD?.trim();
  const port = Number.parseInt(process.env.SMTP_PORT ?? "465", 10);
  const secure = (process.env.SMTP_SECURE ?? "true").toLowerCase() === "true";

  if (!host || !user || !rawPassword || !Number.isInteger(port) || port < 1 || port > 65_535) {
    return failed(messages, "SMTP is not fully configured. Check SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASSWORD.");
  }

  // Google displays App Passwords in groups separated by spaces. SMTP expects
  // the same password without those display spaces.
  const password = host.toLowerCase() === "smtp.gmail.com"
    ? rawPassword.replace(/\s+/g, "")
    : rawPassword;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass: password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  try {
    return await Promise.all(
      messages.map(async (message): Promise<EmailResult> => {
        try {
          const result = await transport.sendMail({
            from,
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html,
          });
          return { ...message, success: true, providerMessageId: result.messageId };
        } catch (error) {
          return { ...message, success: false, error: errorMessage(error) };
        }
      }),
    );
  } finally {
    transport.close();
  }
}

async function sendWithResend(
  messages: EmailMessage[],
  from: string,
): Promise<EmailResult[]> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return failed(messages, "RESEND_API_KEY is not configured.");

  const resend = new Resend(apiKey);
  return Promise.all(
    messages.map(async (message): Promise<EmailResult> => {
      try {
        const result = await resend.emails.send({
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
        if (result.error) return { ...message, success: false, error: result.error.message };
        return { ...message, success: true, providerMessageId: result.data?.id };
      } catch (error) {
        return { ...message, success: false, error: errorMessage(error) };
      }
    }),
  );
}

export async function sendQuoteEmails(messages: EmailMessage[]): Promise<EmailResult[]> {
  if (!messages.length) return [];

  const from = process.env.EMAIL_FROM?.trim();
  if (!from) return failed(messages, "EMAIL_FROM is not configured.");

  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase() || "resend";
  if (provider === "smtp") return sendWithSmtp(messages, from);
  if (provider === "resend") return sendWithResend(messages, from);

  return failed(messages, `Unsupported EMAIL_PROVIDER: ${provider}`);
}
