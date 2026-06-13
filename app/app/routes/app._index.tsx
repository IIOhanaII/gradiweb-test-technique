import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
// Modèle client-safe (constantes, types, fonctions pures) : utilisable côté client.
import { FIELD_CATALOG, configFromForm, type ComparatorFieldKey } from "../comparator";
// I/O Admin API : server-only, utilisé uniquement dans loader/action.
import { readConfig, writeConfig } from "../comparator.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const config = await readConfig(admin);
  return { config };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const config = configFromForm(formData);
  const result = await writeConfig(admin, config);
  return { ok: result.ok, errors: result.errors };
};

const LABELS: Record<ComparatorFieldKey, string> = Object.fromEntries(
  FIELD_CATALOG.map((f) => [f.key, f.label]),
) as Record<ComparatorFieldKey, string>;

export default function ConfigScreen() {
  const { config } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  // Conteneur des lignes : on y relit l'état des switches au moment du Save.
  const listRef = useRef<HTMLDivElement>(null);

  // L'ordre vit dans l'état React (réordonnable via les flèches). L'activation
  // reste « non contrôlée » : chaque s-switch porte son propre état via
  // defaultChecked, qu'on relit dans le DOM à la soumission. On évite ainsi le
  // binding incertain des custom events sur les web components.
  const [order, setOrder] = useState<ComparatorFieldKey[]>(
    config.fields.map((f) => f.key),
  );
  const enabledMap = useMemo(
    () => Object.fromEntries(config.fields.map((f) => [f.key, f.enabled])),
    [config.fields],
  ) as Record<ComparatorFieldKey, boolean>;

  const saving =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.ok) shopify.toast.show("Configuration saved");
  }, [fetcher.data, shopify]);

  const move = (index: number, direction: -1 | 1) => {
    setOrder((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  // Soumission programmatique (pattern du template Shopify) : on construit le
  // FormData depuis l'ordre (état React) + l'état lu des switches (DOM), puis on
  // poste vers l'action de cette route.
  const save = () => {
    const formData = new FormData();
    formData.set("order", order.join(","));
    listRef.current?.querySelectorAll("s-switch").forEach((el) => {
      const name = el.getAttribute("name");
      const node = el as unknown as { checked?: boolean };
      const checked =
        typeof node.checked === "boolean" ? node.checked : el.hasAttribute("checked");
      if (name && checked) formData.set(name, "on");
    });
    fetcher.submit(formData, { method: "post" });
  };

  const errors = fetcher.data?.errors ?? [];

  return (
    <s-page heading="Comparator configuration">
      {/*
        Attributs booléens des web components : on ne les pose QUE s'ils sont
        vrais. `loading={false}` / `disabled={false}` rendraient l'attribut
        présent (donc actif). D'où le spread conditionnel ci-dessous.
      */}
      <s-button slot="primary-action" onClick={save} {...(saving ? { loading: true } : {})}>
        Save
      </s-button>

      <s-section heading="Comparison table fields">
        <s-paragraph>
          Choose which fields appear in the storefront comparison table, and in
          which order. Changes apply to the comparison page after saving.
        </s-paragraph>

        <div ref={listRef}>
        <s-stack direction="block" gap="base">
          {order.map((key, index) => (
            <s-box key={key} padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-stack direction="inline" gap="small-300">
                  <s-button
                    icon="chevron-up"
                    variant="tertiary"
                    accessibilityLabel={`Move ${LABELS[key]} up`}
                    {...(index === 0 ? { disabled: true } : {})}
                    onClick={() => move(index, -1)}
                  />
                  <s-button
                    icon="chevron-down"
                    variant="tertiary"
                    accessibilityLabel={`Move ${LABELS[key]} down`}
                    {...(index === order.length - 1 ? { disabled: true } : {})}
                    onClick={() => move(index, 1)}
                  />
                </s-stack>
                <s-switch
                  label={LABELS[key]}
                  name={`enabled_${key}`}
                  defaultChecked={enabledMap[key]}
                />
              </s-stack>
            </s-box>
          ))}
        </s-stack>
        </div>
      </s-section>

      {errors.length > 0 && (
        <s-banner tone="critical" heading="Couldn't save the configuration">
          <s-unordered-list>
            {errors.map((message, i) => (
              <s-list-item key={i}>{message}</s-list-item>
            ))}
          </s-unordered-list>
        </s-banner>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
