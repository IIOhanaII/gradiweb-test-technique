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
- **A.2 — Drawer + première requête Storefront** : overlay global (`comparator-drawer.liquid`, rendu près du `cart-drawer`) ; lanceur flottant + panneau. À l'ouverture, `comparator.js` récupère les produits sélectionnés en **une** requête Storefront GraphQL `nodes(ids:)` (ordre préservé, produits introuvables filtrés + purgés du localStorage). Token injecté via réglage de thème → `window.COMPARATOR_CONFIG`, **jamais en dur dans le JS ni commité** (saisi dans l'éditeur de thème ; repo public). Rendu DOM (pas d'`innerHTML`) ; états chargement/vide/erreur/token-manquant ; accessibilité dialog (focus-trap, Esc, overlay, `aria-modal`, scroll lock, `prefers-reduced-motion`) ; prix avec barré si `compareAt > price`. Fetch déclenché seulement à l'ouverture / changement-pendant-ouverture (le compteur, lui, se met à jour sans réseau).
- **A.3 — Page de comparaison** : template Liquid pur `templates/page.compare.liquid` (coquille, **aucune donnée produit en Liquid** comme l'exige l'énoncé) ; à assigner à une page admin (modèle `compare`) → URL `/pages/<handle>`. Le tableau est construit côté client par **`comparator-page.js`** (fichier séparé pour isoler la logique de page de l'état/drawer ; il consomme les helpers partagés via `window.Comparator.shared` — transport Storefront, GID, formatage). Requête Storefront **détaillée** (description courte, variantes, disponibilité, metafields `custom.length/weight/flex`) validée contre le schéma 2026-04. Tableau responsive (`<table>` sémantique, scroll horizontal, **colonne libellés `sticky`**), une colonne par produit (2–4). Mise en évidence : ligne **atténuée + badge « Identique »** si toutes les valeurs sont égales, sinon surlignage de la **meilleure cellule** sur les specs orientées (prix/poids au plus bas, flex au plus haut ; longueur neutre). « Ajouter au panier » réutilise le **mécanisme natif de Dawn** (rendu des `sections` du `cart-drawer` + `renderContents` + `publish(cartUpdate)`) → le tiroir et le compteur d'en-tête se mettent à jour comme un ajout depuis une fiche produit. État vide élégant + CTA collection ; bouton « Vider la comparaison ». CTA « Comparer » du drawer activé et routé vers la page (réglage de thème `type: page`). Config `COMPARATOR_CONFIG` isolée dans `snippets/comparator-config.liquid`. Réglages du thème localisés via clés `t:settings_schema.comparator.*`.
- **i18n** : toutes les chaînes du comparateur passées en clés de locale `comparator.*` (anglais = langue publiée du store, vérifiée via Storefront `localization` ; français maintenu dans `fr.json` pour publication ultérieure). Strings statiques via `{{ 'comparator.x' | t }}`, strings JS via `COMPARATOR_CONFIG.strings`. On ne maintient que en + fr → règle `MatchingTranslations` désactivée dans `.theme-check.yml` (choix assumé, documenté).

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
| 3 | Claude Opus 4.8 (Claude Code) | A.2 — drawer + 1ʳᵉ requête Storefront GraphQL + i18n | `comparator-drawer.liquid`, `component-comparator-drawer.css`, bloc Drawer dans `comparator.js`, config `theme.liquid`, `settings_schema.json`, locales en/fr, `.theme-check.yml` | Itérations à ma demande : token sorti du repo (public) → éditeur de thème ; i18n réduit à en+fr (au lieu de 30 locales) + `MatchingTranslations` off ; `{% render %}` déplacé près du `cart-drawer` ; indentation locales soignée. Token vérifié 200 en réel avant intégration. Relecture ligne à ligne (`nodes(ids:)`, `Intl.NumberFormat`, `[ID!]!`, reflow `offsetWidth`, focus-trap, gabarit `{title}`) | Drawer fonctionnel + requête live + a11y + i18n ; durcissement sécurité token discuté et appliqué |
| 4 | Claude Opus 4.8 (Claude Code) | A.3 — page de comparaison (template + tableau + highlight specs + panier) | `page.compare.liquid`, `comparator-page.js`, `comparator-page.css`, `comparator-config.liquid` + `comparator.js`, `theme.liquid`, `comparator-drawer.liquid`, `settings_schema.json`, locales en/fr + schema | Requête détaillée validée via MCP avant intégration. Itérations à ma demande : **découpe** du JS (`comparator-page.js` séparé, helpers via `window.Comparator.shared`) ; **réutilisation** du panier natif Dawn plutôt qu'un `addToCart` maison ; **rgb en dur → variables** (overlay = token Dawn `--color-foreground` ; badges stock = custom properties locales, faute de token sémantique) ; CSS `component-` retiré du nom de la page (pas un composant réutilisable) ; **config sortie** de `theme.liquid` vers un snippet ; réglages **localisés** en `t:` + bloc placé après `cart` dans les locales schema. Pédagogie demandée sur transport/`requestId`/DOM-vs-innerHTML/`cartControl`. Mobile-first/fluide confirmé (aucune media query desktop-first). | Page complète, a11y + responsive + i18n, intégrée au thème sans dépendance externe |

_Entrées ajoutées au fil de l'eau._
