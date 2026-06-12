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

**Outil unique** : Claude Opus 4.8 (via Claude Code), en **pair-programming spec par spec**. Méthode constante : l'IA produit *et explique le pourquoi* ; je relis **ligne à ligne**, je conteste, je tranche, puis commit atomique. Les entrées ci-dessous suivent les 5 points demandés par l'énoncé — la rubrique **Delta** est éclatée en *« Mes objections & décisions »* (ce que j'ai contesté/rejeté/imposé, et pourquoi) pour rendre lisible mon rôle critique, complétée d'*« Axes d'amélioration »* (ce que je ferais avec plus de temps).

> Lecture : ce ne sont pas des corrections cosmétiques. Chaque objection ci-dessous est un choix d'architecture ou de convention que j'ai imposé *contre* la première proposition de l'IA, en sachant le justifier à l'oral.

### Entrée 1 — Setup du repo (commits `3b5f472` → `e31239a`)
- **Tâche** : init git, `package.json` (scripts CLI Shopify), serveur MCP Shopify au scope projet, restructuration mono-repo `theme/` + `app/`, squelettes README/COMPTE-RENDU.
- **Output IA** : scripts CLI, `.mcp.json`, arborescence.
- **Mes objections & décisions** : mono-repo `theme/`+`app/` choisi pour garder front et back versionnés ensemble mais isolés ; MCP Shopify ajouté pour **valider les requêtes GraphQL contre le schéma réel** plutôt que coder de mémoire.
- **Axes d'amélioration** : —
- **Valeur** : ~30 min de plomberie évitées.

### Entrée 2 — A.1 bouton « Comparer » (commit `e1d996a`)
- **Tâche** : bouton produit + état `localStorage` + CSS.
- **Output IA** : `compare-button.liquid`, module `window.Comparator` dans `comparator.js`, CSS, branchements layout/section/template.
- **Mes objections & décisions** :
  - **Refusé le CSS global** initialement proposé → imposé un `component-compare-button.css` colocalisé, chargé via `stylesheet_tag` **uniquement là où le bouton est rendu** (convention Dawn, pas de CSS mort ailleurs).
  - Imposé de ne stocker que l'**identité** `{id, handle}` en localStorage (jamais les données d'affichage figées) → fraîcheur garantie via Storefront.
  - Relu ligne à ligne : `hintEl`, sync multi-onglets via event `storage`, logique d'état désactivé (plein mais retirable).
- **Axes d'amélioration** : —
- **Valeur** : spec + a11y (`aria-pressed`, `focus-visible`, `role=status`) câblées d'emblée.

### Entrée 3 — A.2 drawer + 1ʳᵉ requête Storefront + i18n (commit `f899ab5`)
- **Tâche** : tiroir flottant + récupération Storefront GraphQL + internationalisation.
- **Output IA** : `comparator-drawer.liquid`, son CSS, bloc Drawer dans `comparator.js`, config `theme.liquid`, `settings_schema.json`, locales.
- **Mes objections & décisions** :
  - **Sécurité (repo public)** : refusé tout token en dur/commité → sorti le token Storefront vers un **réglage de thème** saisi dans l'éditeur, jamais dans le repo. Token vérifié `200` en réel avant intégration.
  - **i18n** : refusé de maintenir les 30 locales Dawn → réduit à **en + fr** et désactivé la règle `MatchingTranslations` (assumé/documenté) plutôt que de fausses traductions.
  - Imposé de **déplacer** le `{% render %}` près du `cart-drawer` (cohérence DOM) ; rendu **DOM (pas `innerHTML`)** pour la sûreté des titres produit.
  - Relu : `nodes(ids:)` (ordre préservé + purge des fantômes), `Intl.NumberFormat`, `[ID!]!`, reflow `offsetWidth`, focus-trap, gabarit `{title}`.
- **Axes d'amélioration** : le token Storefront reste public côté navigateur — **vrai remède = App Proxy (Partie B/C)** : navigateur → app Node → Shopify côté serveur.
- **Valeur** : drawer + requête live + a11y dialog + i18n ; faille de sécurité anticipée et tracée.

### Entrée 4 — A.3 page de comparaison (commit `cf0ef8b`)
- **Tâche** : template page + tableau comparatif + highlight specs + ajout panier.
- **Output IA** : `page.compare.liquid`, `comparator-page.js`, `comparator-page.css`, `comparator-config.liquid` + modifs `comparator.js`/`theme.liquid`/`comparator-drawer.liquid`/`settings_schema.json`/locales. Requête détaillée **validée via MCP** contre l'API 2026-04 avant intégration.
- **Mes objections & décisions** (nombreuses — c'est la spec la plus discutée) :
  - **Template** : imposé `page.compare.liquid` en **Liquid pur** (fidèle à l'énoncé) plutôt qu'un JSON+section, la page étant une coquille 100 % client-side.
  - **Découpe JS** : refusé le méga-fichier → **`comparator-page.js` séparé**, helpers partagés exposés via `window.Comparator.shared` (transport, GID, formatage). Le handler `storage` redispatche `comparator:change` pour que le fichier séparé reçoive le cross-onglet.
  - **Réutilisation > réécriture** : refusé un `addToCart` maison → fait **vérifier** qu'aucun client Storefront ni `addToCart` réutilisable n'existait dans Dawn (logique enfermée dans `<product-form>`), puis **réutilisé le mécanisme natif** (`sections` + `cart.renderContents` + `publish(cartUpdate)`) → tiroir/compteur d'en-tête à jour comme un vrai ajout produit.
  - **CSS** : contesté le préfixe `component-` pour la page (ce n'est pas un composant réutilisable) → **renommé** `comparator-page.css` ; refusé les **rgb en dur** → variables (overlay = token Dawn `--color-foreground` comme le cart-drawer natif ; badges stock = custom properties locales, Dawn n'ayant pas de token sémantique succès/erreur).
  - **Lisibilité/archi** : exigé de **sortir** le gros objet `COMPARATOR_CONFIG` de `theme.liquid` vers un **snippet** dédié.
  - **i18n réglages** : refusé les chaînes en dur dans `settings_schema.json` → clés **`t:settings_schema.comparator.*`** + bloc placé **après `cart`** dans les locales schema (ordre cohérent).
  - **Highlight** : validé la sémantique métier — prix/poids surlignés au **min**, flex au **max**, **longueur neutre** (le « meilleur » dépend du rider).
  - **Pédagogie active** : exigé que l'IA explique avant que j'accepte — *transport* (couche réseau partagée), *requestId* (garde anti-réponse périmée), *DOM vs innerHTML* (anti-XSS), rôle de *cartControl*. Confirmé le **mobile-first** (aucune media query desktop-first).
- **Axes d'amélioration** :
  - micro-helpers DOM (`el(tag, class, text)`) pour alléger la verbosité du rendu — proposés, **volontairement non appliqués** (j'ai préféré l'explicite pour l'instant).
  - **Partie C (à venir)** : la page devra lire le metafield de config `cosmiweb.comparator_config` (B.1) pour filtrer les lignes, et tracker les comparaisons vers un endpoint (B.2).
- **Valeur** : page complète (a11y + responsive + i18n), intégrée au thème **sans dépendance externe**.

_Entrées ajoutées au fil de l'eau._
