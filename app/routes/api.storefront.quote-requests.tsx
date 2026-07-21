import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { parseQuoteRequest } from "../features/enquiries/quote-request.schema";
import { CatalogValidationError } from "../services/catalog.server";
import { AttachmentValidationError } from "../services/file-storage.server";
import { createQuoteRequest, RequiredFieldError } from "../services/quote-request.server";
import { enforceQuoteRateLimit, hashClientIp, RateLimitError } from "../services/rate-limit.server";

const json = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const context = await authenticate.public.appProxy(request);
    if (!context.session || !context.admin) return json({ error: "The store administrator must open the app once before accepting requests." }, 503);
    const shop = context.session.shop;
    await enforceQuoteRateLimit(request, shop);
    const formData = await request.formData();
    const parsed = parseQuoteRequest(formData);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Check the form and try again." }, 422);
    const attachmentEntry = formData.get("attachment");
    const enquiry = await createQuoteRequest({
      admin: context.admin, shopDomain: shop, input: parsed.data,
      attachment: attachmentEntry instanceof File ? attachmentEntry : null,
      customerIpHash: hashClientIp(request, shop), userAgent: request.headers.get("user-agent"),
    });
    return json({ id: enquiry.publicId, message: "Your quote request has been received. We will contact you soon." }, 201);
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RateLimitError) return json({ error: "Too many requests. Please wait a few minutes and try again." }, 429, { "Retry-After": String(error.retryAfterSeconds) });
    if (error instanceof CatalogValidationError || error instanceof AttachmentValidationError || error instanceof RequiredFieldError) return json({ error: error.message }, 422);
    console.error("Quote request failed", error);
    return json({ error: "We could not send your request. Please try again." }, 500);
  }
};
export const loader = () => json({ error: "Method not allowed." }, 405, { Allow: "POST" });
