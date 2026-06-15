# COMPTE-RENDU — Comparateur de produits Shopify

> Test technique Cosmiweb — Développeur Fullstack E-commerce (Shopify)

## Liens & accès

- **Repository GitHub** : https://github.com/IIOhanaII/gradiweb-test-technique
- **Store de développement** : `gradiweb-test.myshopify.com` _(staff account communiqué par email)_
- **App déployée** : https://comparator-app.fly.dev (Fly.io, région `cdg`)

---

## 1. Résumé de l'approche

### Partie A — Front-end (thème)

- **A.1 — Bouton « Ajouter à la comparaison »**
  - **Intégration** : snippet `compare-button.liquid` rendu comme block de la section `main-product` → déplaçable/désactivable depuis l'éditeur de thème.
  - **État** : `localStorage` (clé `cosmiweb:compare`) ; ne stocke que l'identité du produit (`{id, handle}`) — les données d'affichage sont re-fetchées via Storefront, jamais figées.
  - **Logique** : centralisée dans `comparator.js` (module `window.Comparator`, chargé globalement car transverse) ; sync multi-onglets via l'event `storage` ; limite de 4 produits avec libellé d'aide.
  - **CSS** : colocalisé en `component-compare-button.css` (convention Dawn `component-*`), chargé via `stylesheet_tag` dans le snippet → présent uniquement quand le bouton est rendu.

- **A.2 — Barre de comparaison persistante + première requête Storefront**
  - **UI** : bandeau persistant en bas de page (`comparator-drawer.liquid`, `role="region"`), rendu près du `cart-drawer`. Apparaît dès qu'un produit est ajouté, se masque quand la liste est vide. Affiche les produits sélectionnés (miniature, titre, prix, **retrait individuel ✕**) + CTA « **Comparer maintenant** » + « Vider ». **Masqué sur la page de comparaison elle-même** (redondant avec le tableau).
  - **Responsive (mobile-first)** : en mobile, bandeau compact déplié vers le haut via un chevron ; à partir de 750px la vue enrichie est affichée directement.
  - **Données** : `comparator.js` récupère les produits en **une** requête Storefront GraphQL `nodes(ids:)` (ordre préservé, produits introuvables filtrés + purgés du localStorage). Le bandeau étant persistant, son contenu reflète la sélection **en continu**.
  - **Sécurité** : token injecté via réglage de thème → `window.COMPARATOR_CONFIG`, **jamais en dur dans le JS ni commité** (saisi dans l'éditeur de thème, hors repo).
  - **Rendu & a11y** : rendu DOM (pas d'`innerHTML`) ; états chargement/erreur/token-manquant ; `aria-live="polite"`, `aria-expanded` sur le bouton de dépliage, `prefers-reduced-motion` ; prix barré si `compareAt > price`. (Pas de pattern dialog : un bandeau persistant n'est pas une modale → ni focus-trap ni scroll-lock.)

- **A.3 — Page de comparaison**
  - **Template** : `templates/page.compare.liquid` en Liquid **pur** (coquille, **aucune donnée produit en Liquid** comme l'exige l'énoncé) ; assigné à une page admin (modèle `compare`) → URL `/pages/<handle>`.
  - **Construction** : tableau monté côté client par **`comparator-page.js`** (fichier séparé pour isoler la logique de page de l'état/drawer ; consomme les helpers partagés via `window.Comparator.shared` — transport Storefront, GID, formatage).
  - **Requête** : Storefront **détaillée** (description courte, variantes, disponibilité, metafields `custom.length/weight/flex`), validée contre le schéma 2026-04.
  - **Tableau** : `<table>` sémantique, responsive (scroll horizontal, **colonne libellés `sticky`**), une colonne par produit (2–4).
  - **Mise en évidence** : ligne **atténuée + badge « Identique »** si toutes les valeurs sont égales ; sinon surlignage de la **meilleure cellule** sur les specs orientées (prix/poids au plus bas, flex au plus haut ; longueur neutre).
  - **Panier** : « Ajouter au panier » réutilise le **mécanisme natif de Dawn** (rendu des `sections` du `cart-drawer` + `renderContents` + `publish(cartUpdate)`) → tiroir et compteur d'en-tête à jour comme un ajout depuis une fiche produit.
  - **Détails** : état vide élégant + CTA collection ; bouton « Vider la comparaison » ; CTA « Comparer » du drawer activé et routé vers la page (réglage `type: page`) ; config isolée dans `snippets/comparator-config.liquid` ; réglages localisés via clés `t:settings_schema.comparator.*`.

- **i18n**
  - Toutes les chaînes passées en clés de locale `comparator.*` (anglais = langue publiée du store, vérifiée via Storefront `localization` ; français maintenu dans `fr.json` pour publication ultérieure).
  - Statiques via `{{ 'comparator.x' | t }}`, dynamiques (JS) via `COMPARATOR_CONFIG.strings`.
  - On ne maintient que **en + fr** → règle `MatchingTranslations` désactivée dans `.theme-check.yml` (choix assumé, documenté).

### Partie B — App embarquée (admin)

- **B.0 — Scaffold**
  - App générée via `shopify app init` (template officiel Shopify). Le template « Remix » scaffolde désormais **React Router 7** (`@shopify/shopify-app-react-router`) : App Bridge, **Polaris web components** (`s-*`), sessions Prisma/SQLite, auth OAuth + webhooks.
  - **Justification** (FAQ l'autorise) : framework officiel, full-stack (loaders/actions ⇒ Admin API appelée **côté serveur**, jamais le token au navigateur), zéro glue à écrire.
  - Scaffold isolé dans son propre commit pour distinguer le généré de mon code.

- **B.1 — Écran Configuration**
  - **Fonction** : le marchand active/désactive et **réordonne** (flèches ↑/↓) les champs comparables (Prix, Description, Variantes, Stock, Poids, Metafield perso).
  - **Stockage** : metafield **boutique** `cosmiweb.comparator_config` (type `json`) via Admin GraphQL `metafieldsSet` ; la **définition** est créée avec `storefront: PUBLIC_READ` pour que le thème (Partie C) la lise via Storefront.
  - **Architecture** : séparation stricte **modèle client-safe** (`comparator.ts` : catalogue, types, fonctions pures) / **I/O serveur** (`comparator.server.ts`) — cf. journal #5, bug d'hydratation.
  - **UI** : Polaris web components (pas de CSS custom) ; réordonnancement par flèches (pas de DnD ⇒ zéro dépendance) ; switches non-contrôlés relus dans le DOM au save ; toast de succès, bannière d'erreur.
  - **Robustesse** : normalisation tolérante à la lecture (donnée metafield non fiable ⇒ repli sur défauts).

- **B.2 — Écran Statistiques**
  - **Fonction** : produits les plus comparés sur **30 jours glissants**.
  - **Stockage** : metafield **boutique** `cosmiweb.comparator_stats` (json), **sans** définition Storefront (lu côté admin, écrit côté serveur en Partie C — jamais exposé au thème).
  - **Shape** : **buckets journaliers** `{daily:{"YYYY-MM-DD":{"<id>":n}}}` ⇒ vraie fenêtre glissante (somme des buckets) + purge simple ; agrégation = fonction pure.
  - **UI** : tableau Polaris `s-table` (vignette + titre **lié à la fiche produit dans l'admin** + nombre) ; **état vide** élégant ; bouton **Réinitialiser** avec **modale de confirmation** (Modal API déclarative `command --show/--hide`).
  - **Détail** : `featuredImage` conservé (le `featuredMedia` non-déprécié exigeait 7 scopes média pour une simple miniature).

### Partie C — Connexion Front ↔ Back

- **C.1 — Configuration dynamique côté front**
  - **Principe** : la page de comparaison lit la config définie dans l'admin (B.1) et **construit son tableau en conséquence**.
  - **Lecture** : `comparator-page.js` récupère `cosmiweb.comparator_config` via **Storefront** (`shop { metafield(namespace, key) { value } }`, **dans la même requête que les produits** — zéro aller-retour réseau supplémentaire), le normalise (lecture tolérante), puis génère les lignes selon les champs **activés** et leur **ordre**.
  - **Mapping** : `price`/`description`/`variants`/`stock`/`weight` → une ligne chacun ; `custom_metafield` → les metafields snowboard **`length` + `flex`** (cf. décision de réconciliation) ; image, titre et « Ajouter au panier » sont **structurels** (toujours affichés).
  - **Résultat** : repli sur les défauts si le metafield est absent ; désactiver « Stock » dans l'admin fait **disparaître la ligne** côté boutique au rechargement suivant.

- **C.2 — Tracking des comparaisons**
  - **Voie d'écriture** : l'API Storefront ne peut **pas écrire** → la page POST les identifiants comparés en **same-origin** sur `/apps/comparator/track` via un **App Proxy**.
  - **Côté serveur** : Shopify relaie la requête (signée HMAC) vers la route `proxy.track.tsx` (`authenticate.public.appProxy`), qui obtient un client **Admin** (token *offline* de la boutique, **jamais exposé au navigateur**) et incrémente le bucket du jour de `cosmiweb.comparator_stats` (lecture-modification-écriture + purge des buckets > 35 j).
  - **Best-effort** : envoi en `keepalive` + `catch` silencieux → un échec de tracking n'impacte jamais l'affichage ; déclenché **une fois par chargement** de la page (énoncé : « à chaque chargement »), pas à chaque ajout/retrait.
  - **Bénéfice transverse** : c'est aussi le **vrai remède** au token Storefront exposé — à terme, router toutes les lectures produit via l'app.

- **Stratégie de fraîcheur / cache**
  - Toutes les données affichées (produits, prix, stock, **et la config**) sont relues **en direct** via Storefront à chaque chargement — rien n'est figé en Liquid ni mis en cache dur côté client.
  - Conséquence : une modification de config dans l'admin est prise en compte **dès le rechargement suivant** (cohérence quasi-immédiate, aux délais de propagation CDN Storefront près).
  - **Choix assumé** : à cette échelle (≤ 4 produits comparés), la simplicité et la fraîcheur priment sur l'économie de requêtes. Une mise en cache (`sessionStorage` à TTL court) serait l'optimisation naturelle si le volume l'exigeait — voir §4.

---

## 2. Choix techniques & justifications

- **Thème**
  - Base : `Generated Data Theme` (thème de dev Shopify, OS 2.0, basé sur Dawn).
  - Tous les fichiers du comparateur sont originaux ; je **réutilise** systématiquement les conventions Dawn (composants `component-*`, ajout panier natif, tokens CSS `--color-*`) plutôt que de réécrire.

- **App**
  - Template officiel `shopify app init` → **React Router 7** (`@shopify/shopify-app-react-router`), App Bridge, **Polaris web components** (`s-*`), OAuth, sessions Prisma/SQLite.
  - Justifié (FAQ l'autorise) : framework **officiel** et full-stack — les `loader`/`action` exécutent l'Admin API **côté serveur**, le token n'atteint jamais le navigateur ; zéro glue d'auth à écrire.
  - L'arbo `backend/frontend` suggérée par l'énoncé est fusionnée par le framework (loaders/actions = le « backend »), ce qui est plus idiomatique.

- **Déploiement** — **Fly.io** (région `cdg`), https://comparator-app.fly.dev
  - Image Docker (template) + **volume persistant** monté sur `/data` pour la base SQLite des sessions — sans quoi les sessions seraient perdues à chaque déploiement et l'app se « désinstallerait » de fait.
  - Schéma Prisma piloté par `DATABASE_URL` (local : `file:dev.sqlite` ; prod : `file:/data/dev.sqlite`) ; migrations appliquées au boot (`prisma migrate deploy`).
  - L'app est **publique/installée** sur la boutique de dev (une app embarquée s'utilise installée, pas en localhost seul).

- **Stockage**
  - Tout l'état persistant vit dans des **metafields boutique** (namespace `cosmiweb`) : `comparator_config` (exposé Storefront pour lecture front) et `comparator_stats` (**non** exposé : lu admin, écrit serveur).
  - Pas de base applicative dédiée : config/stats sont de la donnée boutique → autant la garder dans Shopify (portable, pas d'infra à maintenir).

- **API**
  - **Storefront GraphQL** côté client (données produit + lecture config) ; **Admin GraphQL** côté serveur (écriture config, lecture/écriture stats).
  - Toutes les opérations GraphQL ont été **validées contre le schéma réel via le MCP Shopify** avant intégration, plutôt que codées de mémoire.

- **Sécurité du token**
  - **Aucun secret commité** (bonne pratique, indépendamment de la visibilité du repo).
  - Le token Storefront (public par conception côté navigateur, mais gardé hors repo) est saisi dans l'éditeur de thème ; l'écriture des stats passe par l'**App Proxy** (token Admin côté serveur uniquement).

- **Alertes Dependabot (dépendances)**
  - Les alertes remontées (esbuild, lodash, minimatch…) sont **toutes transitives et issues du tooling de build/lint du scaffold officiel Shopify** (devDependencies).
  - Analyse : aucune n'est **atteignable dans le runtime déployé** — le build React Router ne bundle que le code importé par l'app, et ces paquets s'exécutent uniquement au build/lint (machine de dev / CI), jamais dans le chemin d'une requête visiteur ; la faille esbuild est de plus spécifique à un usage Deno qu'on n'a pas.
  - **Choix assumé de ne pas les « corriger »** : le seul fix disponible (`npm audit fix --force`) impose des **versions majeures breaking** (`@shopify/api-codegen-preset@2.0`, `typescript-eslint@8`…) → risque réel de casser un build/déploiement fonctionnel pour **un gain de sécurité nul côté production**. La distinction dev-tooling / runtime prime sur le compteur d'alertes.

---

## 3. Difficultés rencontrées

- **Metafields snowboard introuvables via Storefront (A.3)**
  - *Symptôme* : `custom.length/weight/flex` revenaient `null`.
  - *Cause* : valeurs jamais écrites (l'import CSV natif échouait silencieusement, « Used in: 0 products »).
  - *Remède* : écriture des 39 valeurs (13 produits × 3 champs) directement via **Admin GraphQL `metafieldsSet`**, vérifiées ensuite en lecture Storefront.

- **Hydratation React qui échoue en silence (B.1)**
  - *Symptôme* : les boutons de l'écran Config restaient inertes.
  - *Faux coupable écarté* : le **piège des attributs booléens** des web components (`disabled={false}` rend l'attribut *présent*).
  - *Cause racine* : l'import d'une **valeur** (`FIELD_CATALOG`) depuis un module `*.server.ts` utilisée côté client → le module server-only est retiré du bundle client → `undefined` → l'hydratation casse → aucun `onClick` ne s'attache (mais le SSR affiche l'écran, d'où le symptôme trompeur). Le typecheck ne l'attrape pas (bug runtime).
  - *Remède* : **séparer** le modèle client-safe (`comparator.ts`) de l'I/O serveur (`comparator.server.ts`).

- **Définition de metafield invisible au Storefront (C.1)**
  - *Symptôme* : la config s'enregistrait (valeur présente côté admin) mais le front ne réagissait pas.
  - *Diagnostic* : interrogation **directe** des API en réel (curl Storefront *et* Admin) → la **définition** du metafield n'avait jamais été créée → valeur invisible au Storefront → le front retombait toujours sur les défauts.
  - *Cause fine* : `metafieldDefinitionCreate` appelé avec `access.admin: MERCHANT_READ_WRITE`, **refusé** pour une définition boutique exposée Storefront (« must be one of [public_read_write] »), *et* le code **ignorait les `userErrors`** → échec totalement silencieux.
  - *Remède* : **omettre `access.admin`** (le défaut devient `PUBLIC_READ_WRITE`) et **vérifier désormais les userErrors** (throw sauf `TAKEN`).

- **Enregistrement de l'App Proxy (C.2)**
  - Le tracking ne pouvait fonctionner faute du scope **`write_app_proxy`** (requis pour configurer un proxy, confirmé en doc) — manquant dans `[access_scopes]`.
  - L'`url` du proxy était un placeholder absolu `https://example.com` ; la **bonne pratique** est une URL **relative** (`/proxy`) que Shopify préfixe avec l'URL de l'app (tunnel en dev, host en prod).
  - Le mapping `/apps/<subpath>/<reste>` → `<url>/<reste>` a imposé de nommer la route `proxy.track.tsx` (`/proxy/track`).

- **Tunnel de dev instable**
  - `shopify app dev` ouvre un tunnel `trycloudflare` qui tombe parfois (« Impossible de trouver l'IP… ») ; il faut relancer la commande et rouvrir l'aperçu via la Dev Console.
  - Variante en prod : un **dev preview** resté actif dans l'admin force l'app vers l'ancien tunnel mort → le couper (badge « dev previews ») fait recharger l'app depuis l'URL Fly déployée.

---

## 4. Ce que j'aurais fait avec plus de temps

**UX / UI**

- **Skeleton loaders** pendant les requêtes Storefront (drawer + page) plutôt qu'un simple « chargement… » textuel.
- **Transitions/animations** plus soignées : ouverture du drawer, apparition des lignes du tableau, micro-feedback « +1 » sur le compteur à chaque ajout.
- **États vides illustrés** (bandeau + page) plutôt que du texte seul, pour guider l'utilisateur vers une première sélection.
- **Sélecteur de variante inline** dans le tableau pour les produits multi-variantes, au lieu de renvoyer vers la fiche pour « choisir les options ».
- **Responsive plus abouti** : sur très petit écran, basculer le tableau en cartes empilées plutôt qu'un scroll horizontal.
- **Réordonnancement par drag & drop** dans l'écran Config (avec une lib justifiée) — plus intuitif que les flèches — et **Save Bar contextuelle** d'App Bridge.
- **Audit d'accessibilité complet** : test lecteur d'écran sur le tableau comparatif, parcours clavier de bout en bout, contrastes.

**Sécurité & robustesse**

- **Router toutes les lectures produit via l'App Proxy** : aujourd'hui le drawer et la page lisent le Storefront avec un token public côté navigateur. Le proxy (déjà en place pour le tracking) permettrait de déplacer ces lectures côté serveur → plus aucun token exposé. *(Optionnel : lire en Storefront avec token public reste le pattern idiomatique Shopify ; ce serait un durcissement, pas une correction.)*
- **Atomicité des stats** : `recordComparison` fait une lecture-modification-écriture sans verrou ; sous forte concurrence, deux écritures simultanées pourraient s'écraser. Une file ou un compteur atomique (voire un petit store dédié) serait plus robuste à l'échelle.
- **Cache léger côté front** : un `sessionStorage` avec TTL court pour la config/les produits éviterait de refetcher à chaque navigation, sans sacrifier la fraîcheur (cf. §Stratégie de fraîcheur).

**Admin & données**

- **Metafield personnalisé configurable** : laisser le marchand cibler un namespace/key précis depuis l'écran Config (aujourd'hui `custom_metafield` est mappé en dur sur `length` + `flex`).
- **Liens admin via App Bridge intents** plutôt qu'URL `admin.shopify.com` en dur (plus robuste au multi-store) ; **pagination / top N** sur les stats si le catalogue grossit.

**Tests**

- **Tests unitaires** (Vitest) sur les fonctions pures déjà isolées à cette fin (`aggregateStats`, `normalizeConfig`, `normalizeStats`) — la séparation modèle/I-O a justement été pensée pour ça.
- **Test d'intégration** sur la route App Proxy (vérification de la signature HMAC, incrément du bon bucket).

**i18n**

- **Publier réellement le français** : aujourd'hui seul l'anglais est une langue *active* de la boutique, donc les traductions `fr.json` (déjà écrites) ne s'affichent jamais. Il faudrait ajouter le français comme langue publiée (réglages Markets/Langues), puis réactiver la règle Theme Check `MatchingTranslations` (désactivée car on ne maintenait que en + fr).

---

## 5. Journal d'usage de l'IA

**Outil unique** : Claude Opus 4.8 (via Claude Code), en **pair-programming spec par spec**. Méthode constante : l'IA produit *et explique le pourquoi* ; je relis **ligne à ligne**, je conteste, je tranche, puis commit atomique. Les entrées ci-dessous suivent les 5 points demandés par l'énoncé — la rubrique **Delta** est éclatée en *« Mes objections & décisions »* (ce que j'ai contesté/rejeté/imposé, et pourquoi) pour rendre lisible mon rôle critique, complétée d'*« Axes d'amélioration »* (ce que je ferais avec plus de temps).

> Lecture : ce ne sont pas des corrections cosmétiques. Chaque objection ci-dessous est un choix d'architecture ou de convention que j'ai imposé *contre* la première proposition de l'IA.

### Entrée 1 — Setup du repo (commits `3b5f472` → `e31239a`)
- **Tâche** : init git, `package.json` (scripts CLI Shopify), serveur MCP Shopify au scope projet, restructuration mono-repo `theme/` + `app/`, squelettes README/COMPTE-RENDU.
- **Output IA** : scripts CLI, `.mcp.json`, arborescence.
- **Mes objections & décisions** : mono-repo `theme/`+`app/` choisi pour garder front et back versionnés ensemble mais isolés ; MCP Shopify ajouté pour **valider les requêtes GraphQL contre le schéma réel** plutôt que coder de mémoire.
- **Valeur** : plomberie de setup expédiée (**~30 min économisées**).

### Entrée 2 — A.1 bouton « Comparer » (commit `e1d996a`)
- **Tâche** : bouton produit + état `localStorage` + CSS.
- **Output IA** : `compare-button.liquid`, module `window.Comparator` dans `comparator.js`, CSS, branchements layout/section/template.
- **Mes objections & décisions** :
  - **Refusé le CSS global** initialement proposé → imposé un `component-compare-button.css` colocalisé, chargé via `stylesheet_tag` **uniquement là où le bouton est rendu** (convention Dawn, pas de CSS mort ailleurs).
  - Imposé de ne stocker que l'**identité** `{id, handle}` en localStorage (jamais les données d'affichage figées) → fraîcheur garantie via Storefront.
  - Relu ligne à ligne : `hintEl`, sync multi-onglets via event `storage`, logique d'état désactivé (plein mais retirable).
- **Valeur** : spec + a11y (`aria-pressed`, `focus-visible`, `role=status`) câblées d'emblée (**~1 h économisée**).

### Entrée 3 — A.2 drawer + 1ʳᵉ requête Storefront + i18n (commit `f899ab5`)
- **Tâche** : tiroir flottant + récupération Storefront GraphQL + internationalisation.
- **Output IA** : `comparator-drawer.liquid`, son CSS, bloc Drawer dans `comparator.js`, config `theme.liquid`, `settings_schema.json`, locales.
- **Mes objections & décisions** :
  - **Sécurité** : refusé tout token en dur/commité → sorti le token Storefront vers un **réglage de thème** saisi dans l'éditeur, jamais dans le repo. Token vérifié `200` en réel avant intégration.
  - **i18n** : refusé de maintenir les 30 locales Dawn → réduit à **en + fr** et désactivé la règle `MatchingTranslations` (assumé/documenté) plutôt que de fausses traductions.
  - Imposé de **déplacer** le `{% render %}` près du `cart-drawer` (cohérence DOM) ; rendu **DOM (pas `innerHTML`)** pour la sûreté des titres produit.
  - Relu : `nodes(ids:)` (ordre préservé + purge des fantômes), `Intl.NumberFormat`, `[ID!]!`, reflow `offsetWidth`, focus-trap, gabarit `{title}`.
- **Axes d'amélioration** : le token Storefront reste public côté navigateur — **vrai remède = App Proxy (Partie B/C)** : navigateur → app Node → Shopify côté serveur.
- **Valeur** : drawer + requête live + a11y dialog + i18n ; faille de sécurité anticipée et tracée (**~3 h économisées**).

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
- **Valeur** : page complète (a11y + responsive + i18n), intégrée au thème **sans dépendance externe** (**~4–5 h économisées** — la spec la plus dense).

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
- **Valeur** : écran Config fonctionnel (lecture/écriture metafield boutique, scopes suffisants confirmés en réel) ; surtout, un bug d'hydratation non trivial diagnostiqué jusqu'à la cause racine plutôt que contourné (**~3 h économisées net**, le débogage ayant repris une part du gain).

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
- **Valeur** : écran Stats complet (table, état vide, reset confirmé) prêt à être alimenté par le tracking de la Partie C (**~2–3 h économisées**).

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
- **Valeur** : boucle complète config ↔ front ↔ stats fonctionnelle (testée en réel : POST `200`, stats qui montent, lignes filtrées) ; deux bugs non triviaux (def Storefront invisible, scope proxy) diagnostiqués jusqu'à la cause plutôt que contournés (**~3–4 h économisées**).

### Entrée 8 — A.2 en bandeau persistant + correctif ajout panier (commits `6fd5dbd`, `90e3c0a`)
- **Tâche** : à la relecture de l'énoncé, A.2 demandait un **bandeau/tiroir persistant qui *affiche* les produits** (miniatures, titres, retrait, CTA), or notre implémentation cachait tout derrière un lanceur + drawer modal. Reconstruction en sticky bar, puis correctif d'un bug d'ajout au panier découvert au test.
- **Output IA** : réécriture de `comparator-drawer.liquid` (bandeau `role=region`), `comparator.js` (`Drawer`→`Bar`), `component-comparator-drawer.css` (bandeau bas mobile-first), clé i18n `compare_now`, masquage sur le template `compare` ; puis `comparator-page.js` (requête d'ajout panier en FormData).
- **Mes objections & décisions** :
  - **Écart de conformité repéré par relecture de l'énoncé** : c'est moi qui ai rapproché l'axe « sticky compare bar » (que l'IA avait rangé dans les *améliorations futures*) de l'exigence A.2 réelle — l'IA avait initialement considéré le drawer modal comme conforme. Décision : **reconstruire**, pas documenter comme « à faire ».
  - **Suppression assumée du pattern dialog** : un bandeau persistant n'est pas une modale → retrait de focus-trap/overlay/Esc/scroll-lock (~100 lignes), remplacés par `role=region` + `aria-live` + `aria-expanded`. Moins de code **et** plus juste sémantiquement.
  - **Responsive piloté par l'usage** (mon idée) : compact + dépliage au chevron en mobile, vue enrichie directe ≥750px — plutôt qu'un seul rendu.
  - **Masquage sur la page compare** : j'ai tranché que le bandeau y est redondant (son CTA pointerait vers la page courante) → `unless template.suffix == 'compare'`.
  - **Débogage par la cause, pas le symptôme (ajout panier)** : 1er ajout → total incrémenté mais tiroir « vide ». Plutôt que bricoler le rendu, j'ai comparé **notre requête à celle de `<product-form>` de Dawn** → différence : corps **JSON** avec `Content-Type: application/javascript` (incohérent) vs **FormData** chez Dawn. Correctif = reproduire Dawn fidèlement (FormData + suppression du Content-Type) + retrait de `is-empty` sur l'hôte `<cart-drawer>` (Dawn ne le retire que de `.drawer__inner`).
- **Axes d'amélioration** : skeleton loaders, transitions, sélecteur de variante inline (cf. §4) ; padding bas de page pour éviter le chevauchement du bandeau avec le footer sur les pages non-compare.
- **Valeur** : conformité A.2 rétablie + bug panier corrigé à la racine ; net simplification (suppression du pattern modal). (**~2 h économisées**, hors temps de relecture/décision qui restait à ma charge.)

_Entrées ajoutées au fil de l'eau._
