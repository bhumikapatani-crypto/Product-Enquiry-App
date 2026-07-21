# Storefront quote extension

## What is implemented

`extensions/quote-request` is a section-targeted theme app block for product templates. It includes:

- Product autofill and selected-variant synchronization
- Merchant-controlled visibility, product tag rule, colors, radius, labels, and required fields
- Customer name/email prefill for signed-in customers
- Responsive native dialog with keyboard and screen-reader support
- Client-side required-field, email, quantity, file type, and file size validation
- A honeypot field and a multipart POST to the Shopify app proxy
- Theme-editor placeholder when visibility rules hide the block

The browser is not a security boundary. The upcoming `/api/storefront/quote-requests` route must authenticate the Shopify app-proxy signature, ignore untrusted product descriptions in favor of Admin API data, validate every field again, rate limit requests, scan/store files privately, and create the enquiry transaction.

## Preview in a development store

1. Use a Node version supported by the project's `package.json`.
2. Set a real app URL and redirect URL through `shopify app dev`; the CLI updates development URLs automatically.
3. Run `shopify app dev` from the project directory.
4. Open the development store from the CLI preview link.
5. Go to **Online Store > Themes > Customize**.
6. Open a product template and select **Add block > Apps > Request a quote**.
7. Configure the block and select **Save**.
8. Open that product storefront page and test the button, modal, responsive layout, and browser validation.

The modal can be previewed immediately. Submission will return an error until the app-proxy backend feature is implemented.

## Deploy the extension

After the backend route and production URLs are configured:

```bash
shopify app build
shopify app deploy
```

Deployment publishes an app version; the merchant must still add the app block to the desired product template. Shopify does not automatically modify theme templates.
