# Product Enquiry & Quote Request architecture

## Runtime boundaries

The app is an embedded Shopify app built from Shopify's React Router template. Every admin loader and action authenticates with `authenticate.admin(request)`. Storefront submissions will enter through an app proxy, be verified by Shopify authentication, then pass through rate limiting, schema validation, sanitization, and a service transaction.

```text
Shopify Admin                         Online Store
  React Router + App Bridge            Theme app extension
  Polaris web components               App block + modal
           |                                  |
           +---- authenticated routes --------+
                              |
                     validation / services
                              |
              repositories / Prisma transactions
                              |
                    Neon PostgreSQL + object storage
                              |
                   email provider / background jobs
```

## Intended folder structure

```text
app/
  components/          Reusable admin presentation components
  features/            Feature-local UI, schemas, and view models
    analytics/
    enquiries/
    settings/
  lib/                 Cross-cutting server/client-safe utilities
  repositories/        Prisma queries; no HTTP or UI concerns
  services/            Business workflows and provider interfaces
  routes/              Thin React Router loaders, actions, and pages
  db.server.ts          Singleton Prisma client
  shopify.server.ts     Shopify authentication and API configuration
extensions/
  quote-request/        Theme app extension (added in storefront phase)
prisma/
  migrations/          Immutable production migrations
  schema.prisma         PostgreSQL data model
tests/
  unit/                 Pure validation and service tests
  integration/          Database/repository and route tests
  e2e/                  Merchant and storefront browser flows
```

Files are added only when their feature is implemented; the boundaries above are the contract for subsequent phases.

## Data ownership and tenancy

- `Shop.domain` is the stable tenant key. All merchant data is related to a `Shop` and repository methods will require a shop identifier.
- Shopify sessions remain in the template-compatible `Session` table. Access tokens are never exposed to browser code.
- Enquiries store product and variant snapshots so historical requests remain accurate after catalog edits.
- Files store metadata only; bytes belong in private object storage and are accessed with short-lived signed URLs.
- Notes use soft deletion. Activities are append-only. Webhook IDs are unique for idempotent processing.
- Uninstall marks the shop inactive and deletes Shopify sessions. Business records are retained according to the future privacy/retention policy.

## Query strategy

Dashboard queries use cursor pagination with deterministic `(createdAt, id)` ordering. Compound indexes cover tenant/status/time filters, customer lookup, product analytics, activity timelines, email retries, and webhook reconciliation. Free-text search starts with indexed exact/prefix filters; PostgreSQL trigram or full-text indexes can be added based on measured production query plans.

## Incremental delivery plan

1. Architecture and PostgreSQL schema (this phase).
2. Installation lifecycle, shop bootstrap, and authenticated navigation.
3. Theme app extension, visibility rules, and quote modal.
4. Secure storefront submission, upload pipeline, and email delivery.
5. Enquiry list/detail workflows, notes, status, and timeline.
6. Settings and email-template management.
7. Analytics, CSV/XLSX export, and product-update synchronization.
8. Security hardening, automated tests, observability, and deployment.

## Database workflow

For an empty development Neon branch:

```bash
cp .env.example .env
npx prisma migrate deploy
npx prisma generate
npx prisma validate
```

For future changes, edit `schema.prisma`, run `npx prisma migrate dev --name <change>` against a disposable development branch, review the SQL, and commit the migration. Production runs only `prisma migrate deploy`.
