import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

/**
 * App Home is configured at the origin root. Always enter through the
 * authenticated app layout; authenticate.admin then handles session-token
 * exchange and any required top-level Shopify authentication.
 */
export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  return redirect(`/app${url.search}`);
};

export default function IndexRedirect() {
  return null;
}
