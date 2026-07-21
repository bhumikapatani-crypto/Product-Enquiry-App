# Secure quote submission

The theme block posts multipart form data through Shopify's app proxy to `POST /api/storefront/quote-requests`.

## Security and processing order

1. `authenticate.public.appProxy` validates Shopify's request signature and resolves the installed shop session.
2. An atomic PostgreSQL bucket allows five submissions per shop/client fingerprint per ten minutes. The database stores an HMAC, never the raw IP address.
3. Zod normalizes, strips markup/control characters, validates lengths, and checks identifiers, email, and quantity.
4. The Admin GraphQL API resolves the submitted variant and confirms that it belongs to the submitted product. Browser-supplied titles and prices are ignored.
5. Attachment bytes are inspected by magic signature, limited to 10 MB, assigned an unguessable key, and written to private storage.
6. Prisma creates the enquiry, attachment metadata, product snapshot, and activity rows transactionally.
7. Email delivery is attempted and every result is recorded. Email failure does not discard the customer's enquiry.

## Development behavior

- With no storage bucket, files are written to ignored `.data/private-uploads` paths.
- With no Resend credentials, delivery uses a no-op result so the database workflow remains testable. No real email is sent.

Restart `shopify app dev` after migrations or Prisma schema changes. Open the embedded app once to establish its offline session, then submit from the storefront product page.

## Production credentials

Copy the provider fields from `.env.example` into the hosting platform's encrypted environment configuration:

- `RESEND_API_KEY` and a verified-domain `EMAIL_FROM`
- `FILE_STORAGE_BUCKET`, region, access key, and secret
- `FILE_STORAGE_ENDPOINT` for an S3-compatible provider such as Cloudflare R2

The bucket must be private. Do not configure public object access. Production deliberately rejects file uploads when private storage is absent.
