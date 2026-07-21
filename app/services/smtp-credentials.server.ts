import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";

export type SmtpConfiguration = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
};

const VERSION = "v1";

function encryptionKey() {
  // A dedicated key is preferred in production. Shopify CLI can regenerate a
  // local .env while switching dev stores, so the stable app secret is a safe
  // development fallback and remains server-only.
  const secret = process.env.EMAIL_CREDENTIALS_ENCRYPTION_KEY?.trim()
    || process.env.SHOPIFY_API_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("Email credential encryption is not configured on the app server.");
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptSmtpPassword(password: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptSmtpPassword(value: string) {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(":");
  if (version !== VERSION || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("The stored SMTP credential is invalid.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function createSmtpTransport(config: SmtpConfiguration) {
  const password = config.host.toLowerCase() === "smtp.gmail.com"
    ? config.password.replace(/\s+/g, "")
    : config.password;
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

export async function verifySmtpConfiguration(config: SmtpConfiguration) {
  const transport = createSmtpTransport(config);
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}
