# COMPTE-RENDU — Comparateur de produits Shopify

> Test technique Cosmiweb — Développeur Fullstack E-commerce (Shopify)

## Liens & accès

- **Repository GitHub** : https://github.com/IIOhanaII/gradiweb-test-technique
- **Store de développement** : `gradiweb-test.myshopify.com` _(staff account communiqué par email à l'évaluateur)_
- **App déployée** : _(URL Fly.io — à compléter)_

---

## 1. Résumé de l'approche

### Partie A — Front-end (thème)

- **A.1 — Bouton « Ajouter à la comparaison »** : snippet `compare-button.liquid` rendu comme block de la section `main-product` (donc déplaçable/désactivable depuis l'éditeur de thème). L'état vit dans `localStorage` (clé `cosmiweb:compare`) et ne stocke que l'identité du produit (`{id, handle}`) — les données d'affichage seront re-fetchées via Storefront API, jamais figées. Logique centralisée dans `comparator.js` (module `window.Comparator`, chargé globalement car transverse) ; synchronisation multi-onglets via l'event `storage` ; limite de 4 produits avec libellé d'aide. CSS colocalisé en `component-compare-button.css` (convention Dawn `component-*`), chargé via `stylesheet_tag` dans le snippet → présent uniquement quand le bouton est rendu.

### Partie B — App embarquée (admin)
_À compléter._

### Partie C — Connexion Front ↔ Back
_À compléter._

---

## 2. Choix techniques & justifications

- **Thème** : `Generated Data Theme` (thème de dev Shopify, OS 2.0) comme base de structure. Tous les fichiers du comparateur sont originaux.
- **App** : Remix (template officiel `shopify app`) — App Bridge 4.x, Polaris, OAuth, sessions et Prisma déjà câblés. _Justification détaillée à compléter._
- **Déploiement** : Fly.io (Dockerfile fourni par le template, volume persistant pour la session). _À compléter._
- **Storefront API (GraphQL)** côté client pour les données produit ; **Admin API (GraphQL)** côté backend pour les metafields et analytics.

_Détails par partie à compléter._

---

## 3. Difficultés rencontrées

_À compléter (avec le raisonnement, y compris les blocages contournés)._

---

## 4. Ce que j'aurais fait avec plus de temps

_À compléter._

---

## 5. Journal d'usage de l'IA

> Pour chaque usage significatif : Outil · Tâche (prompt) · Output · Delta (ce que j'ai changé/rejeté et pourquoi) · Valeur (temps gagné / complexité débloquée).

| # | Outil | Tâche | Output | Delta | Valeur |
|---|-------|-------|--------|-------|--------|
| 1 | Claude Opus 4.8 (Claude Code) | Setup repo : init git, package.json CLI Shopify, MCP Shopify, restructuration `theme/`+`app/` | Scripts CLI, `.mcp.json`, mono-repo | _à compléter après revue_ | ~30 min de setup |
| 2 | Claude Opus 4.8 (Claude Code) | A.1 — bouton Comparer (snippet + JS état localStorage + CSS) | `compare-button.liquid`, `comparator.js`, `component-compare-button.css` + branchements layout/section/template | Refacto à ma demande du CSS global → `component-*.css` colocalisé chargé uniquement avec le bouton (cohérence Dawn) ; relecture ligne à ligne (`hintEl`, event `storage`, états bouton) | Spec implémentée + accessibilité (aria-pressed, focus-visible, role=status) câblée d'emblée |

_Entrées ajoutées au fil de l'eau._
