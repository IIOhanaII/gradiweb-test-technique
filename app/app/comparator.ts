/**
 * Modèle de la configuration du comparateur — partie *client-safe* (Partie B.1).
 *
 * Ce fichier ne contient QUE des constantes, des types et des fonctions pures :
 * il peut être importé aussi bien côté serveur (loader/action) que côté client
 * (composant React). Les accès à l'API Admin vivent à part dans
 * `comparator.server.ts` (server-only) pour ne pas casser le bundle client.
 *
 * La config décrit quels champs sont affichés dans le tableau de comparaison
 * storefront, et dans quel ordre. Elle est persistée dans un metafield de la
 * BOUTIQUE (namespace `cosmiweb`, key `comparator_config`, type `json`).
 */

export const CONFIG_NAMESPACE = "cosmiweb";
export const CONFIG_KEY = "comparator_config";
export const STATS_KEY = "comparator_stats";

export type ComparatorFieldKey =
  | "price"
  | "description"
  | "variants"
  | "stock"
  | "weight"
  | "custom_metafield";

export interface ComparatorField {
  key: ComparatorFieldKey;
  enabled: boolean;
}

export interface ComparatorConfig {
  fields: ComparatorField[];
}

/**
 * Catalogue de référence : la liste exhaustive des champs configurables (énoncé),
 * leur ordre par défaut et leur libellé d'interface (admin, en anglais).
 */
export const FIELD_CATALOG: { key: ComparatorFieldKey; label: string }[] = [
  { key: "price", label: "Price" },
  { key: "description", label: "Description" },
  { key: "variants", label: "Variants" },
  { key: "stock", label: "Stock" },
  { key: "weight", label: "Weight" },
  { key: "custom_metafield", label: "Custom metafield" },
];

// Désactivés par défaut : le metafield personnalisé n'a de sens qu'une fois ciblé.
const DEFAULT_DISABLED: ComparatorFieldKey[] = ["custom_metafield"];

const KNOWN_KEYS = new Set<ComparatorFieldKey>(FIELD_CATALOG.map((f) => f.key));

export function defaultConfig(): ComparatorConfig {
  return {
    fields: FIELD_CATALOG.map((f) => ({
      key: f.key,
      enabled: !DEFAULT_DISABLED.includes(f.key),
    })),
  };
}

/**
 * Réconcilie une config brute (stockée, potentiellement partielle ou ancienne)
 * avec le catalogue courant : on conserve l'ordre stocké pour les clés connues,
 * on ignore les clés inconnues, et on ajoute en fin les nouvelles clés du
 * catalogue (avec leur valeur par défaut). Garantit une config toujours complète.
 */
export function normalizeConfig(raw: unknown): ComparatorConfig {
  const seen = new Set<ComparatorFieldKey>();
  const fields: ComparatorField[] = [];

  const rawFields =
    raw && typeof raw === "object" && Array.isArray((raw as { fields?: unknown }).fields)
      ? ((raw as { fields: unknown[] }).fields)
      : [];

  for (const item of rawFields) {
    if (!item || typeof item !== "object") continue;
    const key = (item as { key?: unknown }).key as ComparatorFieldKey;
    if (KNOWN_KEYS.has(key) && !seen.has(key)) {
      fields.push({ key, enabled: Boolean((item as { enabled?: unknown }).enabled) });
      seen.add(key);
    }
  }

  for (const f of FIELD_CATALOG) {
    if (!seen.has(f.key)) {
      fields.push({ key: f.key, enabled: !DEFAULT_DISABLED.includes(f.key) });
    }
  }

  return { fields };
}

/**
 * Construit une config à partir des données du formulaire B.1 :
 * - `order` : liste de clés séparées par des virgules (ordre choisi)
 * - `enabled_<key>` : présent uniquement si le champ correspondant est activé.
 */
export function configFromForm(formData: FormData): ComparatorConfig {
  const order = String(formData.get("order") || "")
    .split(",")
    .map((k) => k.trim())
    .filter((k): k is ComparatorFieldKey => KNOWN_KEYS.has(k as ComparatorFieldKey));

  const orderedKeys: ComparatorFieldKey[] = [
    ...order,
    ...FIELD_CATALOG.map((f) => f.key).filter((k) => !order.includes(k)),
  ];

  return {
    fields: orderedKeys.map((key) => ({
      key,
      enabled: formData.get(`enabled_${key}`) != null,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Statistiques de comparaison (B.2)                                  */
/* ------------------------------------------------------------------ */

/**
 * Compteurs de comparaison rangés en **buckets journaliers** :
 * `daily["YYYY-MM-DD"]["<productId>"] = n`. Ce découpage par jour permet une
 * vraie fenêtre glissante de 30 jours (somme des buckets récents) et une purge
 * simple des jours trop anciens. Les ids produit sont stockés en numérique
 * (dernier segment du GID).
 */
export interface StatsData {
  daily: Record<string, Record<string, number>>;
}

export interface StatRow {
  id: string;
  count: number;
}

export function emptyStats(): StatsData {
  return { daily: {} };
}

/** Clé de jour UTC `YYYY-MM-DD` (triable lexicographiquement = chronologiquement). */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Lecture défensive : tout `daily` invalide retombe sur des stats vides. */
export function normalizeStats(raw: unknown): StatsData {
  const daily: StatsData["daily"] = {};
  const rawDaily =
    raw && typeof raw === "object" && (raw as { daily?: unknown }).daily &&
    typeof (raw as { daily?: unknown }).daily === "object"
      ? ((raw as { daily: Record<string, unknown> }).daily)
      : {};

  for (const [day, counts] of Object.entries(rawDaily)) {
    if (!counts || typeof counts !== "object") continue;
    const bucket: Record<string, number> = {};
    for (const [id, n] of Object.entries(counts as Record<string, unknown>)) {
      const value = Number(n);
      if (Number.isFinite(value) && value > 0) bucket[id] = value;
    }
    if (Object.keys(bucket).length) daily[day] = bucket;
  }
  return { daily };
}

/**
 * Agrège les comparaisons sur les `days` derniers jours (fenêtre glissante,
 * aujourd'hui inclus) : somme par produit, trié par nombre décroissant.
 */
export function aggregateStats(
  data: StatsData,
  days = 30,
  now: Date = new Date(),
): StatRow[] {
  const cutoffKey = dayKey(new Date(now.getTime() - (days - 1) * 86_400_000));
  const totals: Record<string, number> = {};

  for (const [day, counts] of Object.entries(data.daily)) {
    // Comparaison lexicographique valide sur des clés `YYYY-MM-DD`.
    if (day < cutoffKey) continue;
    for (const [id, n] of Object.entries(counts)) {
      totals[id] = (totals[id] || 0) + (Number(n) || 0);
    }
  }

  return Object.entries(totals)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);
}
