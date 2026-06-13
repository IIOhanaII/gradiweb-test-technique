import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { aggregateStats } from "../comparator";
import { fetchStatProducts, readStats, resetStats } from "../comparator.server";

const WINDOW_DAYS = 30;
const TOP_LIMIT = 25;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const stats = await readStats(admin);
  const ranked = aggregateStats(stats, WINDOW_DAYS).slice(0, TOP_LIMIT);
  const products = await fetchStatProducts(
    admin,
    ranked.map((r) => r.id),
  );

  // Handle de la boutique pour construire le lien direct vers la fiche admin.
  const storeHandle = session.shop.replace(/\.myshopify\.com$/, "");

  const rows = ranked.map((r) => {
    const product = products.get(r.id);
    return {
      id: r.id,
      count: r.count,
      title: product?.title ?? `#${r.id}`,
      imageUrl: product?.imageUrl ?? null,
      adminUrl: `https://admin.shopify.com/store/${storeHandle}/products/${r.id}`,
    };
  });

  return { rows, windowDays: WINDOW_DAYS };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  if (formData.get("intent") === "reset") {
    const result = await resetStats(admin);
    return { ok: result.ok, errors: result.errors };
  }
  return { ok: false, errors: ["Unknown action"] };
};

export default function StatsScreen() {
  const { rows, windowDays } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const resetting =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.ok) shopify.toast.show("Statistics reset");
  }, [fetcher.data, shopify]);

  const handleReset = () => fetcher.submit({ intent: "reset" }, { method: "post" });

  const hasData = rows.length > 0;

  return (
    <s-page heading="Comparison statistics">
      <s-button
        slot="primary-action"
        tone="critical"
        commandFor="reset-stats-modal"
        command="--show"
        {...(hasData ? {} : { disabled: true })}
      >
        Reset stats
      </s-button>

      <s-section heading={`Most compared products (last ${windowDays} days)`}>
        {hasData ? (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header listSlot="labeled">Comparisons</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((row) => (
                <s-table-row key={row.id}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="base" alignItems="center">
                      <s-thumbnail
                        alt={row.title}
                        size="small"
                        {...(row.imageUrl ? { src: row.imageUrl } : {})}
                      />
                      <s-link href={row.adminUrl} target="_top">
                        {row.title}
                      </s-link>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{row.count}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        ) : (
          <s-stack direction="block" gap="base" alignItems="center">
            <s-paragraph>
              No comparisons recorded yet. Counts appear here once visitors start
              comparing products on the storefront.
            </s-paragraph>
          </s-stack>
        )}
      </s-section>

      {/* Confirmation de réinitialisation (Modal API déclarative : command --show/--hide). */}
      <s-modal id="reset-stats-modal" heading="Reset comparison stats?">
        <s-stack direction="block" gap="base">
          <s-text>
            This clears all comparison counters. This action cannot be undone.
          </s-text>
        </s-stack>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          commandFor="reset-stats-modal"
          command="--hide"
          onClick={handleReset}
          {...(resetting ? { loading: true } : {})}
        >
          Reset stats
        </s-button>
        <s-button slot="secondary-actions" commandFor="reset-stats-modal" command="--hide">
          Cancel
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
