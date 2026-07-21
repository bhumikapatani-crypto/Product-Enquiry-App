import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { toProductGid, toVariantGid } from "../features/enquiries/quote-request.schema";

type CatalogResponse = {
  data?: {
    shop?: { name: string; email: string; currencyCode: string; ianaTimezone: string };
    productVariant?: {
      id: string;
      title: string;
      sku: string | null;
      price: string;
      image: { url: string } | null;
      product: {
        id: string;
        title: string;
        handle: string;
        onlineStoreUrl: string | null;
        featuredMedia: { preview: { image: { url: string } | null } | null } | null;
      };
    } | null;
  };
  errors?: Array<{ message: string }>;
};

export class CatalogValidationError extends Error {}

export async function verifyRequestedProduct(
  admin: AdminApiContext,
  productId: string,
  variantId: string,
) {
  const response = await admin.graphql(
    `#graphql
      query QuoteRequestProduct($variantId: ID!) {
        shop { name email currencyCode ianaTimezone }
        productVariant(id: $variantId) {
          id title sku price image { url }
          product {
            id title handle onlineStoreUrl
            featuredMedia { preview { image { url } } }
          }
        }
      }
    `,
    { variables: { variantId: toVariantGid(variantId) } },
  );
  const payload = (await response.json()) as CatalogResponse;
  if (payload.errors?.length) throw new Error("Shopify product verification failed.");

  const variant = payload.data?.productVariant;
  const shop = payload.data?.shop;
  if (!variant || !shop || variant.product.id !== toProductGid(productId)) {
    throw new CatalogValidationError("The selected product or variant is no longer available.");
  }

  return {
    shop,
    product: variant.product,
    variant: {
      id: variant.id,
      title: variant.title,
      sku: variant.sku,
      price: variant.price,
      imageUrl: variant.image?.url ?? variant.product.featuredMedia?.preview?.image?.url ?? null,
    },
  };
}
