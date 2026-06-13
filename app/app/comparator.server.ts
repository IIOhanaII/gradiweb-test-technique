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
  STATS_KEY,
  defaultConfig,
  emptyStats,
  normalizeConfig,
  normalizeStats,
  type ComparatorConfig,
  type StatsData,
} from "./comparator";

/** Sous-ensemble du contexte Admin dont on a besoin (juste `graphql`). */
interface AdminLike {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
}

/** GID produit numérique → GID complet, et inverse. */
export function toProductGid(id: string): string {
  return id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`;
}
export function numericId(gid: string): string {
  return String(gid).split("/").pop() || gid;
}

/** Récupère le GID de la boutique (owner des metafields boutique). */
async function getShopId(admin: AdminLike): Promise<string | undefined> {
  const response = await admin.graphql(
    `#graphql
      query CompareShopId {
        shop { id }
      }`,
  );
  const body = (await response.json()) as { data?: { shop?: { id?: string } } };
  return body?.data?.shop?.id;
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

  const ownerId = await getShopId(admin);

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

/* ------------------------------------------------------------------ */
/* Statistiques de comparaison (B.2)                                  */
/* ------------------------------------------------------------------ */

/**
 * Lit les stats depuis le metafield boutique `cosmiweb.comparator_stats`.
 * Ce metafield n'a PAS besoin de définition : il est écrit/lu côté serveur
 * (admin), jamais exposé au Storefront (contrairement à la config).
 */
export async function readStats(admin: AdminLike): Promise<StatsData> {
  const response = await admin.graphql(
    `#graphql
      query CompareStats {
        shop {
          metafield(namespace: "${CONFIG_NAMESPACE}", key: "${STATS_KEY}") {
            jsonValue
          }
        }
      }`,
  );
  const body = (await response.json()) as {
    data?: { shop?: { metafield?: { jsonValue?: unknown } | null } };
  };
  return normalizeStats(body?.data?.shop?.metafield?.jsonValue ?? null);
}

/** Remet les compteurs à zéro (bouton « Réinitialiser » de B.2). */
export async function resetStats(
  admin: AdminLike,
): Promise<{ ok: boolean; errors: string[] }> {
  const ownerId = await getShopId(admin);
  const response = await admin.graphql(
    `#graphql
      mutation ResetCompareStats($metafields: [MetafieldsSetInput!]!) {
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
            key: STATS_KEY,
            type: "json",
            value: JSON.stringify(emptyStats()),
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

export interface StatProduct {
  id: string;
  title: string;
  imageUrl: string | null;
}

/**
 * Récupère les détails d'affichage des produits comparés (titre, vignette) en
 * une requête. `featuredImage` est déprécié au profit de `featuredMedia`, mais
 * ce dernier exige une pile de scopes média (read_files, read_orders…) pour une
 * simple miniature : on garde donc `featuredImage` (read_products suffit).
 * `nodes(ids:)` renvoie null pour un produit supprimé, qu'on filtre.
 */
export async function fetchStatProducts(
  admin: AdminLike,
  ids: string[],
): Promise<Map<string, StatProduct>> {
  const map = new Map<string, StatProduct>();
  if (!ids.length) return map;

  const response = await admin.graphql(
    `#graphql
      query StatProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            featuredImage { url }
          }
        }
      }`,
    { variables: { ids: ids.map(toProductGid) } },
  );
  const body = (await response.json()) as {
    data?: {
      nodes?: Array<{
        id: string;
        title: string;
        featuredImage?: { url?: string } | null;
      } | null>;
    };
  };

  for (const node of body?.data?.nodes ?? []) {
    if (!node) continue;
    map.set(numericId(node.id), {
      id: numericId(node.id),
      title: node.title,
      imageUrl: node.featuredImage?.url ?? null,
    });
  }
  return map;
}
