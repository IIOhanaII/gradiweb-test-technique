# COMPTE-RENDU — Comparateur de produits Shopify

> Test technique Cosmiweb — Développeur Fullstack E-commerce (Shopify)

## Liens & accès

- **Repository GitHub** : https://github.com/IIOhanaII/gradiweb-test-technique
- **Store de développement** : `gradiweb-test.myshopify.com` _(staff account communiqué par email à l'évaluateur)_
- **App déployée** : https://comparator-app.fly.dev (Fly.io, région `cdg`)

---

## 1. Résumé de l'approche

### Partie A — Front-end (thème)

- **A.1 — Bouton « Ajouter à la comparaison »** : snippet `compare-button.liquid` rendu comme block de la section `main-product` (donc déplaçable/désactivable depuis l'éditeur de thème). L'état vit dans `localStorage` (clé `cosmiweb:compare`) et ne stocke que l'identité du produit (`{id, handle}`) — les données d'affichage seront re-fetchées via Storefront API, jamais figées. Logique centralisée dans `comparator.js` (module `window.Comparator`, chargé globalement car transverse) ; synchronisation multi-onglets via l'event `storage` ; limite de 4 produits avec libellé d'aide. CSS colocalisé en `component-compare-button.css` (convention Dawn `component-*`), chargé via `stylesheet_tag` dans le snippet → présent uniquement quand le bouton est rendu.
- **A.2 — Drawer + première requête Storefront** : overlay global (`comparator-drawer.liquid`, rendu près du `cart-drawer`) ; lanceur flottant + panneau. À l'ouverture, `comparator.js` récupère les produits sélectionnés en **une** requête Storefront GraphQL `nodes(ids:)` (ordre préservé, produits introuvables filtrés + purgés du localStorage). Token injecté via réglage de thème → `window.COMPARATOR_CONFIG`, **jamais en dur dans le JS ni commité** (saisi dans l'éditeur de thème ; repo public). Rendu DOM (pas d'`innerHTML`) ; états chargement/vide/erreur/token-manquant ; accessibilité dialog (focus-trap, Esc, overlay, `aria-modal`, scroll lock, `prefers-reduced-motion`) ; prix avec barré si `compareAt > price`. Fetch déclenché seulement à l'ouverture / changement-pendant-ouverture (le compteur, lui, se met à jour sans réseau).
- **A.3 — Page de comparaison** : template Liquid pur `templates/page.compare.liquid` (coquille, **aucune donnée produit en Liquid** comme l'exige l'énoncé) ; à assigner à une page admin (modèle `compare`) → URL `/pages/<handle>`. Le tableau est construit côté client par **`comparator-page.js`** (fichier séparé pour isoler la logique de page de l'état/drawer ; il consomme les helpers partagés via `window.Comparator.shared` — transport Storefront, GID, formatage). Requête Storefront **détaillée** (description courte, variantes, disponibilité, metafields `custom.length/weight/flex`) validée contre le schéma 2026-04. Tableau responsive (`<table>` sémantique, scroll horizontal, **colonne libellés `sticky`**), une colonne par produit (2–4). Mise en évidence : ligne **atténuée + badge « Identique »** si toutes les valeurs sont égales, sinon surlignage de la **meilleure cellule** sur les specs orientées (prix/poids au plus bas, flex au plus haut ; longueur neutre). « Ajouter au panier » réutilise le **mécanisme natif de Dawn** (rendu des `sections` du `cart-drawer` + `renderContents` + `publish(cartUpdate)`) → le tiroir et le compteur d'en-tête se mettent à jour comme un ajout depuis une fiche produit. État vide élégant + CTA collection ; bouton « Vider la comparaison ». CTA « Comparer » du drawer activé et routé vers la page (réglage de thème `type: page`). Config `COMPARATOR_CONFIG` isolée dans `snippets/comparator-config.liquid`. Réglages du thème localisés via clés `t:settings_schema.comparator.*`.
- **i18n** : toutes les chaînes du comparateur passées en clés de locale `comparator.*` (anglais = langue publiée du store, vérifiée via Storefront `localization` ; français maintenu dans `fr.json` pour publication ultérieure). Strings statiques via `{{ 'comparator.x' | t }}`, strings JS via `COMPARATOR_CONFIG.strings`. On ne maintient que en + fr → règle `MatchingTranslations` désactivée dans `.theme-check.yml` (choix assumé, documenté).

### Partie B — App embarquée (admin)

- **B.0 — Scaffold** : app embarquée générée via `shopify app init` (template officiel Shopify). Le template « Remix » scaffolde désormais **React Router 7** (`@shopify/shopify-app-react-router`) : App Bridge, **Polaris web components** (`s-*`), sessions Prisma/SQLite, auth OAuth + webhooks. Justification du choix (FAQ l'autorise) : framework officiel, full-stack (loaders/actions ⇒ Admin API appelée **côté serveur**, jamais le token au navigateur), zéro glue à écrire. Scaffold isolé dans son propre commit pour distinguer le généré de mon code.
- **B.1 — Écran Configuration** : le marchand active/désactive et **réordonne** (flèches ↑/↓) les champs comparables (Prix, Description, Variantes, Stock, Poids, Metafield perso). Sauvegarde dans le metafield **boutique** `cosmiweb.comparator_config` (type `json`) via Admin GraphQL `metafieldsSet` ; la **définition** est créée avec `storefront: PUBLIC_READ` pour que le thème (Partie C) la lise via Storefront. Séparation stricte **modèle client-safe** (`comparator.ts` : catalogue, types, fonctions pures) / **I/O serveur** (`comparator.server.ts`) — cf. journal #5, bug d'hydratation. UI en Polaris web components (pas de CSS custom) ; réordonnancement par flèches (pas de DnD ⇒ zéro dépendance) ; switches non-contrôlés relus dans le DOM au save ; toast de succès, bannière d'erreur. Normalisation tolérante à la lecture (donnée metafield non fiable ⇒ repli sur défauts).
- **B.2 — Écran Statistiques** : produits les plus comparés sur **30 jours glissants**. Stockage en metafield **boutique** `cosmiweb.comparator_stats` (json), **sans** définition Storefront (lu côté admin, écrit côté serveur en Partie C — jamais exposé au thème). Shape en **buckets journaliers** `{daily:{"YYYY-MM-DD":{"<id>":n}}}` ⇒ vraie fenêtre glissante (somme des buckets) + purge simple ; agrégation = fonction pure. Tableau Polaris `s-table` (vignette + titre **lié à la fiche produit dans l'admin** + nombre), **état vide** élégant, bouton **Réinitialiser** avec **modale de confirmation** (Modal API déclarative `command --show/--hide`). `featuredImage` conservé (le `featuredMedia` non-déprécié exigeait 7 scopes média pour une simple miniature).

### Partie C — Connexion Front ↔ Back

- **C.1 — Configuration dynamique côté front** : la page de comparaison lit la config définie dans l'admin (B.1) et **construit son tableau en conséquence**. `comparator-page.js` récupère le metafield boutique `cosmiweb.comparator_config` via **Storefront** (`shop { metafield(namespace, key) { value } }`, dans la même requête que les produits — zéro aller-retour réseau supplémentaire), le normalise (lecture tolérante), puis génère les lignes selon les champs **activés** et leur **ordre**. Mapping : `price`/`description`/`variants`/`stock`/`weight` → une ligne chacun ; `custom_metafield` → les metafields snowboard **`length` + `flex`** (cf. décision de réconciliation). Image, titre et « Ajouter au panier » sont **structurels** (toujours affichés). Repli sur les défauts si le metafield est absent. Désactiver « Stock » dans l'admin fait donc **disparaître la ligne** côté boutique au rechargement suivant.
- **C.2 — Tracking des comparaisons** : l'API Storefront ne peut **pas écrire** → la page POST les identifiants comparés en **same-origin** sur `/apps/comparator/track` via un **App Proxy**. Shopify relaie la requête (signée HMAC) vers la route `proxy.track.tsx` de l'app (`authenticate.public.appProxy`), qui obtient un client **Admin** (token *offline* de la boutique, **jamais exposé au navigateur**) et incrémente le bucket du jour de `cosmiweb.comparator_stats` (lecture-modification-écriture + purge des buckets > 35 j). L'envoi est **best-effort** (`keepalive`, `catch` silencieux) : un échec de tracking n'impacte jamais l'affichage. Le tracking part **une fois par chargement** de la page (énoncé : « à chaque chargement »), pas à chaque ajout/retrait. C'est aussi le **vrai remède** au token Storefront exposé : à terme, router toutes les lectures produit via l'app.
- **Stratégie de fraîcheur / cache** : toutes les données affichées (produits, prix, stock, **et la config**) sont relues **en direct** via Storefront à chaque chargement de la page — rien n'est figé en Liquid ni mis en cache dur côté client. Le metafield de config est donc pris en compte **dès le rechargement suivant** une modification dans l'admin (cohérence quasi-immédiate, aux délais de propagation CDN Storefront près). Choix assumé : la simplicité et la fraîcheur priment sur l'économie de requêtes à cette échelle (≤ 4 produits comparés). Une mise en cache (ex. `sessionStorage` avec TTL court) serait l'optimisation naturelle si le volume l'exigeait — voir §4.

---

## 2. Choix techniques & justifications

- **Thème** : `Generated Data Theme` (thème de dev Shopify, OS 2.0, basé sur Dawn) comme base de structure. Tous les fichiers du comparateur sont originaux ; je **réutilise** systématiquement les conventions et mécanismes Dawn (composants `component-*`, ajout panier natif, tokens CSS `--color-*`) plutôt que de réécrire.
- **App** : template officiel `shopify app init`. Le template « Remix » scaffolde aujourd'hui **React Router 7** (`@shopify/shopify-app-react-router`) avec App Bridge, **Polaris web components** (`s-*`), OAuth, sessions Prisma/SQLite. Justifié (FAQ l'autorise) : framework **officiel** et full-stack — les `loader`/`action` exécutent l'Admin API **côté serveur**, donc le token n'atteint jamais le navigateur ; zéro glue d'auth à écrire. L'arbo `backend/frontend` suggérée par l'énoncé est fusionnée par le framework (loaders/actions = le « backend »), ce qui est plus idiomatique.
- **Déploiement** : **Fly.io** (région `cdg`), https://comparator-app.fly.dev. Image Docker (template) + **volume persistant** monté sur `/data` pour la base SQLite des sessions — sans quoi les sessions seraient perdues à chaque déploiement et l'app se « désinstallerait » de fait. Schéma Prisma piloté par `DATABASE_URL` (local : `file:dev.sqlite` ; prod : `file:/data/dev.sqlite`). Migrations appliquées au boot (`prisma migrate deploy`). L'app est **publique/installée** (localhost refusé par l'évaluateur).
- **Stockage** : tout l'état persistant vit dans des **metafields boutique** (namespace `cosmiweb`) — `comparator_config` (config, exposé Storefront pour lecture front) et `comparator_stats` (stats, **non** exposé : lu admin, écrit serveur). Pas de base applicative dédiée : la config/les stats sont de la donnée boutique, autant la garder dans Shopify (portable, pas d'infra à maintenir).
- **API** : **Storefront GraphQL** côté client (données produit + lecture config) ; **Admin GraphQL** côté serveur (écriture config, lecture/écriture stats). Toutes les opérations GraphQL ont été **validées contre le schéma réel via le MCP Shopify** avant intégration, plutôt que codées de mémoire.
- **Sécurité du token** : repo **public** → aucun secret commité. Le token Storefront (public par conception mais hors repo) est saisi dans l'éditeur de thème ; l'écriture des stats passe par l'**App Proxy** (token Admin côté serveur uniquement).

---

## 3. Difficultés rencontrées

- **Metafields snowboard introuvables via Storefront (A.3)** : les `custom.length/weight/flex` revenaient `null`. Cause : valeurs jamais écrites (l'import CSV natif échouait silencieusement, « Used in: 0 products »). Contourné en écrivant les 39 valeurs (13 produits × 3 champs) directement via **Admin GraphQL `metafieldsSet`**, vérifiées ensuite en lecture Storefront.
- **Hydratation React qui échoue en silence (B.1)** : les boutons de l'écran Config restaient inertes. Après avoir d'abord écarté un faux coupable (le **piège des attributs booléens** des web components : `disabled={false}` rend l'attribut *présent*), la **cause racine** s'est révélée être l'import d'une **valeur** (`FIELD_CATALOG`) depuis un module `*.server.ts` utilisée côté client → le module server-only est retiré du bundle client → `undefined` → l'hydratation casse → aucun `onClick` ne s'attache (mais le SSR affiche l'écran, d'où le symptôme trompeur). Le typecheck ne l'attrape pas (bug runtime). Remède : **séparer** le modèle client-safe (`comparator.ts`) de l'I/O serveur (`comparator.server.ts`).
- **Définition de metafield invisible au Storefront (C.1)** : la config s'enregistrait bien (la valeur existait côté admin) mais le front ne réagissait pas. Diagnostiqué en interrogeant **directement** les API en réel (curl Storefront *et* Admin) : la **définition** du metafield n'avait jamais été créée → valeur invisible au Storefront → le front retombait toujours sur les défauts. Pourquoi : `metafieldDefinitionCreate` était appelé avec `access.admin: MERCHANT_READ_WRITE`, **refusé** par Shopify pour une définition boutique exposée Storefront (« must be one of [public_read_write] »), *et* le code **ignorait les `userErrors`** → échec totalement silencieux. Remède : **omettre `access.admin`** (le défaut devient `PUBLIC_READ_WRITE`) et **vérifier désormais les userErrors** (throw sauf `TAKEN`).
- **Enregistrement de l'App Proxy (C.2)** : le tracking ne pouvait fonctionner faute du scope **`write_app_proxy`** (requis pour configurer un proxy, confirmé en doc) — il manquait dans `[access_scopes]`. De plus, l'`url` du proxy était un placeholder absolu `https://example.com` ; la **bonne pratique** est une URL **relative** (`/proxy`) que Shopify préfixe avec l'URL de l'app (tunnel en dev, host en prod). Le mapping `/apps/<subpath>/<reste>` → `<url>/<reste>` a aussi imposé de nommer la route `proxy.track.tsx` (`/proxy/track`).
- **Tunnel de dev instable** : `shopify app dev` ouvre un tunnel `trycloudflare` qui tombe parfois (« Impossible de trouver l'IP… ») ; il faut relancer la commande et rouvrir l'aperçu via la Dev Console.

---

## 4. Ce que j'aurais fait avec plus de temps

- **Router toutes les lectures produit via l'App Proxy** : aujourd'hui le drawer et la page lisent le Storefront avec un token public côté navigateur. Le proxy (déjà en place pour le tracking) permettrait de déplacer ces lectures côté serveur → plus aucun token exposé.
- **Atomicité des stats** : `recordComparison` fait une lecture-modification-écriture sans verrou ; sous forte concurrence, deux écritures simultanées pourraient s'écraser. Une file ou un compteur atomique (voire un petit store dédié) serait plus robuste à l'échelle.
- **Cache léger côté front** : un `sessionStorage` avec TTL court pour la config/les produits éviterait de refetcher à chaque navigation, sans sacrifier la fraîcheur (cf. §Stratégie de fraîcheur).
- **Metafield personnalisé configurable** : laisser le marchand cibler un namespace/key précis depuis l'écran Config (aujourd'hui `custom_metafield` est mappé en dur sur `length` + `flex`).
- **Save Bar contextuelle** d'App Bridge sur l'écran Config, **liens admin via App Bridge intents** plutôt qu'URL en dur, **pagination/top N** sur les stats si le catalogue grossit.
- **Tests** : fonctions pures déjà isolées (`aggregateStats`, `normalize*`) → y ajouter une suite unitaire ; et un test d'intégration sur la route proxy (signature HMAC).
- **i18n complet** : publier réellement le français (les clés `fr.json` existent déjà) et réactiver `MatchingTranslations`.
- **Nettoyage** : retirer les démos du template dans `shopify.app.toml` (`[product.metafields.app.demo_info]`, `[metaobjects.app.example]`).

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

### Entrée 5 — B.0 scaffold + B.1 écran Configuration (commits `159a22e` puis B.1)
- **Tâche** : scaffolder l'app embarquée, puis l'écran de configuration des champs (toggles + réordonnancement) persistant la config en metafield boutique via Admin API.
- **Output IA** : scaffold relocalisé dans `app/` ; module modèle + I/O Admin GraphQL ; route `app._index.tsx` en Polaris web components ; opérations GraphQL validées via MCP contre Admin 2025-10.
- **Mes objections & décisions** :
  - **App neuve** (pas de réutilisation de l'ancien Partner app) et scaffold **dans son propre commit** pour isoler le généré de mon code (défendabilité à l'entretien).
  - **Stockage** : metafield boutique + **définition exposée au Storefront** (`PUBLIC_READ`) pour préparer la lecture front (Partie C), au lieu d'un metafield non lisible côté thème.
  - **Réordonnancement par flèches** plutôt que drag & drop → pas de librairie externe (critère « pas de dépendances non justifiées »).
  - **Débogage piloté par les faits, pas à l'aveugle** : face aux boutons inertes, j'ai successivement isolé (1) le **piège des attributs booléens** des web components (`disabled={false}`/`loading={false}` rendent l'attribut *présent* → bouton bloqué ; corrigé en ne posant l'attribut que s'il est vrai), puis (2) la **vraie cause racine** : `FIELD_CATALOG` (valeur) importé d'un module `*.server` et utilisé **côté client** → le module server-only est retiré du bundle client → `undefined` → **l'hydratation React échoue silencieusement** → aucun `onClick` ne s'attache (mais le SSR affiche l'écran et les `s-switch` natifs basculent quand même). Correctif : **séparer le modèle client-safe** (`comparator.ts`) de l'I/O serveur (`comparator.server.ts`). Le typecheck ne l'attrapait pas (bug runtime client uniquement).
  - **Validation systématique avant intégration** : requêtes Admin validées via MCP, JSX Polaris validé via MCP (a confirmé `s-switch`, `chevron-up/down`, etc.).
- **Axes d'amélioration** :
  - **Save Bar contextuelle** d'App Bridge (`data-save-bar`) plutôt qu'un bouton primaire simple — UX plus shopify-native.
  - **Metafield personnalisé** : permettre de cibler un namespace/key précis (aujourd'hui placeholder désactivé par défaut).
  - Nettoyer les **démos du template** (metafield/metaobject d'exemple dans `shopify.app.toml`).
- **Valeur** : écran Config fonctionnel (lecture/écriture metafield boutique, scopes suffisants confirmés en réel) ; surtout, un bug d'hydratation non trivial diagnostiqué jusqu'à la cause racine plutôt que contourné.

### Entrée 6 — B.2 écran Statistiques (commit `34f2abe`)
- **Tâche** : écran des produits les plus comparés (30 j), avec lien vers la fiche admin et réinitialisation confirmée.
- **Output IA** : modèle stats (buckets journaliers + agrégation pure) ; `readStats`/`resetStats`/`fetchStatProducts` ; route `app.stats.tsx` (table Polaris + modale).
- **Mes objections & décisions** :
  - **Shape stats = buckets journaliers** (pas un simple compteur cumulé) → seule façon d'avoir une vraie **fenêtre 30 jours glissants** + purge ; agrégation isolée en fonction **pure testable**.
  - **Pas de définition Storefront** pour le metafield stats (≠ config) : il est lu par l'admin et écrit côté serveur (Partie C), jamais par le thème → on n'expose pas inutilement.
  - **`featuredImage` plutôt que `featuredMedia`** : la version non-dépréciée tirait 7 scopes média (read_files/orders…) pour une miniature — refusé ce coût ; déprécation assumée et commentée.
  - **Modale de confirmation déclarative** (Modal API `command --show/--hide`) plutôt qu'un état React de visibilité → moins de code, pattern officiel.
  - **Lecture défensive** des stats (donnée metafield non fiable) symétrique à la config.
- **Axes d'amélioration** :
  - **Pagination / top N** si le catalogue grossit (actuellement top 25).
  - **Purge** des buckets > 30 j à l'écriture (Partie C) pour borner la taille du metafield.
  - Lien admin via **App Bridge intents** plutôt qu'URL `admin.shopify.com` en dur (plus robuste au multi-store).
- **Valeur** : écran Stats complet (table, état vide, reset confirmé) prêt à être alimenté par le tracking de la Partie C.

### Entrée 7 — C.1 config dynamique + C.2 tracking App Proxy (commit `4ff772c`)
- **Tâche** : faire **lire** au front la config admin (filtrer/réordonner les lignes du tableau) et **écrire** les stats à chaque comparaison, sans exposer de token côté navigateur.
- **Output IA** : lecture du metafield config dans `comparator-page.js` + `buildTable` piloté par la config ; route `proxy.track.tsx` (App Proxy) + `recordComparison` ; section `[app_proxy]` du `shopify.app.toml`.
- **Mes objections & décisions** :
  - **Une seule requête Storefront** pour la config + les produits (le metafield `shop` ajouté à la requête `nodes` existante) plutôt qu'un appel séparé — moins de réseau, atomicité de la vue.
  - **Réconciliation des champs tranchée** : `custom_metafield` → `length` + `flex` (les metafields snowboard = le « metafield perso »), `weight` 1:1, et image/titre/add-to-cart **structurels** (jamais masquables) — un tableau de comparaison sans titre ni image n'a pas de sens.
  - **Tracking best-effort et non bloquant** (`keepalive`, `catch` silencieux, **une fois par chargement**) : la mesure ne doit jamais dégrader l'expérience ni se déclencher à chaque ajout/retrait.
  - **App Proxy comme seule voie d'écriture** : le Storefront ne peut pas écrire ⇒ proxy same-origin → app → Admin API. C'est aussi, à terme, le **vrai remède** au token Storefront exposé (anticipé dès l'entrée 3).
  - **Débogage piloté par les faits (encore)** : la config ne filtrait rien. Plutôt que de tâtonner dans le JS, j'ai interrogé **directement les deux API en réel** (curl) → preuve que la valeur existait côté Admin mais était `null` côté Storefront → **la définition du metafield n'existait pas**. Cause fine : `metafieldDefinitionCreate` refusait `access.admin: MERCHANT_READ_WRITE` pour une def exposée Storefront, **et le code ignorait les `userErrors`** (échec muet). J'ai imposé de **vérifier désormais les userErrors** — un échec silencieux sur une mutation est une dette qu'on paie plus tard.
  - **Validation par la doc** : le scope `write_app_proxy` manquant et la recommandation d'**URL relative** pour le proxy viennent de la doc Shopify (vérifiée via MCP), pas d'une intuition.
- **Axes d'amélioration** : router aussi les **lectures** produit via le proxy (token zéro navigateur) ; **atomicité** des stats (RMW sans verrou aujourd'hui) ; cache léger côté front ; metafield perso **configurable** plutôt que mappé en dur. (cf. §4.)
- **Valeur** : boucle complète config ↔ front ↔ stats fonctionnelle (testée en réel : POST `200`, stats qui montent, lignes filtrées) ; deux bugs non triviaux (def Storefront invisible, scope proxy) diagnostiqués jusqu'à la cause plutôt que contournés.

_Entrées ajoutées au fil de l'eau._
