import { z } from "zod";

const cleanText = (value: string) =>
  value
    .normalize("NFKC")
    // eslint-disable-next-line no-control-regex -- remove non-printable input characters
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();

const text = (max: number) => z.string().transform(cleanText).pipe(z.string().max(max));
const optionalText = (max: number) =>
  z.string().transform(cleanText).pipe(z.string().max(max)).transform((value) => value || undefined).optional();

export const quoteRequestSchema = z.object({
  customerName: text(160).pipe(z.string().min(1, "Enter your name.")),
  customerEmail: z.string().trim().toLowerCase().email("Enter a valid email address.").max(320),
  customerPhone: optionalText(40),
  companyName: optionalText(160),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  message: optionalText(5_000),
  productId: z.string().regex(/^(?:gid:\/\/shopify\/Product\/)?\d+$/, "Invalid product."),
  variantId: z.string().regex(/^(?:gid:\/\/shopify\/ProductVariant\/)?\d+$/, "Invalid variant."),
  locale: z.string().trim().max(35).optional(),
  honeypot: z.string().max(0, "Invalid submission."),
});

export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;

export function parseQuoteRequest(formData: FormData) {
  return quoteRequestSchema.safeParse({
    customerName: formData.get("customer_name"),
    customerEmail: formData.get("customer_email"),
    customerPhone: formData.get("customer_phone") || undefined,
    companyName: formData.get("company_name") || undefined,
    quantity: formData.get("quantity"),
    message: formData.get("message") || undefined,
    productId: formData.get("product_id"),
    variantId: formData.get("variant_id"),
    locale: formData.get("locale") || undefined,
    honeypot: formData.get("website") || "",
  });
}

export const toProductGid = (id: string) =>
  id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`;

export const toVariantGid = (id: string) =>
  id.startsWith("gid://") ? id : `gid://shopify/ProductVariant/${id}`;
