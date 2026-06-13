/**
 * Accès Admin GraphQL à la configuration du comparateur (Partie B.1) — server-only.
 *
 * Suffixe `.server` : ce module n'est JAMAIS inclus dans le bundle client. Le
 * modèle pur (constantes, types, fonctions) vit dans `comparator.ts`, importable
 * des deux côtés. On garde ici uniquement la lecture/écriture du metafield
 * boutique via l'API Admin.
 *
 * La définition du metafield est créée avec un accès `storefront: PUBLIC_READ`
 * afin que le thème (Partie A/C) puisse la lire via l'API Storefront.
 */

import {
  CONFIG_KEY,
  CONFIG_NAMESPACE,
  defaultConfig,
  normalizeConfig,
  type ComparatorConfig,
} from "./comparator";

/** Sous-ensemble du contexte Admin dont on a besoin (juste `graphql`). */
interface AdminLike {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
}

/** Lit la config depuis le metafield boutique ; renvoie les défauts si absente. */
export async function readConfig(admin: AdminLike): Promise<ComparatorConfig> {
  const response = await admin.graphql(
    `#graphql
      query CompareConfig {
        shop {
          metafield(namespace: "${CONFIG_NAMESPACE}", key: "${CONFIG_KEY}") {
            jsonValue
          }
        }
      }`,
  );
  const body = (await response.json()) as {
    data?: { shop?: { metafield?: { jsonValue?: unknown } | null } };
  };
  const raw = body?.data?.shop?.metafield?.jsonValue ?? null;
  return raw ? normalizeConfig(raw) : defaultConfig();
}

/**
 * S'assure que la définition du metafield existe (avec accès Storefront). Idempotent :
 * si elle existe déjà, l'API renvoie une userError `TAKEN` qu'on ignore.
 */
async function ensureConfigDefinition(admin: AdminLike): Promise<void> {
  await admin.graphql(
    `#graphql
      mutation EnsureCompareConfigDefinition($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition { id }
          userErrors { field message code }
        }
      }`,
    {
      variables: {
        definition: {
          name: "Comparator config",
          namespace: CONFIG_NAMESPACE,
          key: CONFIG_KEY,
          type: "json",
          ownerType: "SHOP",
          access: { admin: "MERCHANT_READ_WRITE", storefront: "PUBLIC_READ" },
        },
      },
    },
  );
}

/** Persiste la config dans le metafield boutique. Renvoie les éventuelles userErrors. */
export async function writeConfig(
  admin: AdminLike,
  config: ComparatorConfig,
): Promise<{ ok: boolean; errors: string[] }> {
  await ensureConfigDefinition(admin);

  const shopResponse = await admin.graphql(
    `#graphql
      query CompareConfigShopId {
        shop { id }
      }`,
  );
  const shopBody = (await shopResponse.json()) as { data?: { shop?: { id?: string } } };
  const ownerId = shopBody?.data?.shop?.id;

  const response = await admin.graphql(
    `#graphql
      mutation SetCompareConfig($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message code }
        }
      }`,
    {
      variables: {
        metafields: [
          {
            ownerId,
            namespace: CONFIG_NAMESPACE,
            key: CONFIG_KEY,
            type: "json",
            value: JSON.stringify(config),
          },
        ],
      },
    },
  );
  const body = (await response.json()) as {
    data?: { metafieldsSet?: { userErrors?: { message: string }[] } };
  };
  const errors = (body?.data?.metafieldsSet?.userErrors ?? []).map((e) => e.message);
  return { ok: errors.length === 0, errors };
}
