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
  dayKey,
  defaultConfig,
  emptyStats,
  normalizeConfig,
  normalizeStats,
  type ComparatorConfig,
  type StatsData,
} from "./comparator";

// Au-delà de cette fenêtre, les buckets journaliers sont purgés à l'écriture
// (marge au-dessus des 30 j affichés) pour borner la taille du metafield.
const STATS_RETENTION_DAYS = 35;

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
 * S'assure que la définition du metafield existe, exposée au Storefront pour
 * que le thème (Parties A/C) la lise. Idempotent : si elle existe déjà, l'API
 * renvoie une userError `TAKEN` qu'on ignore.
 *
 * On ne fixe PAS `access.admin` : pour une définition boutique exposée au
 * Storefront, Shopify impose l'accès admin `PUBLIC_READ_WRITE` (appliqué par
 * défaut quand on l'omet). Le forcer à `MERCHANT_READ_WRITE` est refusé
 * (« must be one of [public_read_write] ») — et comme on ignorait jadis les
 * userErrors, la création échouait silencieusement → metafield invisible au
 * Storefront. On vérifie donc désormais les userErrors (hors `TAKEN`).
 */
async function ensureConfigDefinition(admin: AdminLike): Promise<void> {
  const response = await admin.graphql(
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
          access: { storefront: "PUBLIC_READ" },
        },
      },
    },
  );
  const body = (await response.json()) as {
    data?: {
      metafieldDefinitionCreate?: {
        userErrors?: { message: string; code?: string }[];
      };
    };
  };
  const errors = (body?.data?.metafieldDefinitionCreate?.userErrors ?? []).filter(
    (e) => e.code !== "TAKEN",
  );
  if (errors.length) {
    throw new Error(
      `metafieldDefinitionCreate: ${errors.map((e) => e.message).join("; ")}`,
    );
  }
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

/**
 * Incrémente les compteurs de comparaison pour aujourd'hui (Partie C, appelé
 * depuis l'App Proxy). Lecture-modification-écriture du metafield, puis purge
 * des buckets trop anciens. Note : pas de verrou — sous forte concurrence deux
 * écritures simultanées pourraient s'écraser (acceptable pour ce périmètre ;
 * une file/atomicité serait l'amélioration côté production).
 */
export async function recordComparison(
  admin: AdminLike,
  ids: string[],
): Promise<void> {
  const cleanIds = ids.map((id) => numericId(String(id))).filter(Boolean);
  if (!cleanIds.length) return;

  const stats = await readStats(admin);
  const today = dayKey(new Date());
  const bucket = { ...(stats.daily[today] || {}) };
  for (const id of cleanIds) {
    bucket[id] = (bucket[id] || 0) + 1;
  }
  stats.daily[today] = bucket;

  // Purge des jours au-delà de la rétention.
  const cutoff = dayKey(new Date(Date.now() - STATS_RETENTION_DAYS * 86_400_000));
  for (const day of Object.keys(stats.daily)) {
    if (day < cutoff) delete stats.daily[day];
  }

  const ownerId = await getShopId(admin);
  await admin.graphql(
    `#graphql
      mutation RecordCompareStats($metafields: [MetafieldsSetInput!]!) {
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
            value: JSON.stringify(stats),
          },
        ],
      },
    },
  );
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
