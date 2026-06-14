# Comparator App — app embarquée (Partie B & C)

App d'administration du **comparateur de produits** (test technique Cosmiweb).
Elle permet au marchand de **configurer** les champs comparés et de consulter les
**statistiques** de comparaison, et expose l'endpoint d'**App Proxy** qui collecte
le tracking envoyé par le thème.

> Le code du thème (Partie A) vit dans `../theme`. Cette app est la partie
> back-office (Partie B) + le liant front↔back (Partie C).

## Stack

- **React Router 7** via le template officiel `@shopify/shopify-app-react-router`
  (App Bridge, OAuth, webhooks). Les `loader`/`action` appellent l'**Admin GraphQL
  côté serveur** — aucun token n'atteint le navigateur.
- **Polaris web components** (`s-*`) pour l'UI admin (zéro CSS custom).
- **Prisma + SQLite** pour le stockage des sessions.
- Données métier persistées dans des **metafields boutique** (namespace `cosmiweb`),
  pas en base applicative.

## Fonctionnalités

| Écran / route | Rôle |
| --- | --- |
| `app/routes/app._index.tsx` | **Configuration** (B.1) : activer/désactiver + réordonner les champs comparables. Écrit `cosmiweb.comparator_config` (json, exposé Storefront). |
| `app/routes/app.stats.tsx` | **Statistiques** (B.2) : produits les plus comparés sur 30 j glissants, lien vers la fiche admin, réinitialisation confirmée. Lit `cosmiweb.comparator_stats`. |
| `app/routes/proxy.track.tsx` | **App Proxy** (C.2) : reçoit le POST de tracking du thème (`/apps/comparator/track`), vérifie la signature, incrémente les stats via Admin API. |
| `app/comparator.ts` | Modèle **client-safe** : catalogue des champs, types, fonctions pures (normalisation, agrégation 30 j). |
| `app/comparator.server.ts` | I/O **serveur** : lecture/écriture des metafields config & stats via Admin GraphQL. |

## Prérequis

- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) installé.
- **Node** `>=20.19 <22 || >=22.12` (cf. `engines` du `package.json`).
- Un compte Partenaire + une boutique de développement avec l'app installée.

## Installation

```shell
cd app
npm install
npm run setup   # prisma generate + migrate (crée la base de sessions SQLite)
```

## Lancement (développement)

```shell
npm run dev      # = shopify app dev
```

Le CLI ouvre un tunnel, synchronise la config (`shopify.app.toml`) sur la boutique
de dev — **y compris l'App Proxy et les scopes** — puis fournit l'aperçu. Appuyez
sur `P` pour ouvrir l'app ; installez-la pour démarrer.

> ⚠️ Si vous modifiez les **scopes** ou l'**App Proxy** du `shopify.app.toml`,
> relancez `shopify app dev` (et ré-autorisez l'app dans l'admin si Shopify le
> demande) pour que les changements s'appliquent à la boutique.

## Scripts utiles

| Script | Effet |
| --- | --- |
| `npm run dev` | Développement local (tunnel + sync config). |
| `npm run typecheck` | `react-router typegen` + `tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `npm run build` | Build de production (`react-router build`). |
| `npm run deploy` | Déploie la config de l'app (scopes, App Proxy, webhooks) sur Shopify. |
| `npm run setup` | Prisma generate + migrate (base de sessions). |

## Déploiement

L'app doit être **publique/installée** (localhost refusé par l'évaluateur). Le
template fournit un `Dockerfile` ; le déploiement cible **Fly.io**
([guide Shopify](https://fly.io/docs/js/shopify/)). Pensez à :

- définir `NODE_ENV=production` et les secrets (`SHOPIFY_API_KEY`,
  `SHOPIFY_API_SECRET`, `SCOPES`, `SHOPIFY_APP_URL`) ;
- un **volume persistant** pour la base SQLite des sessions (ou un fournisseur de
  base managé — cf. *Application Storage* plus bas) ;
- exécuter `npm run deploy` pour pousser la config (App Proxy/scopes) en prod.

### Application Storage

Ce template utilise [Prisma](https://www.prisma.io/) (SQLite par défaut) pour les
sessions. SQLite convient en production pour une **instance unique** ; pour
plusieurs instances, basculez vers un fournisseur managé (Postgres, MySQL…) via le
`datasource` de `prisma/schema.prisma`.

## Dépannage (template)

- **`The table main.Session does not exist`** → lancez `npm run setup`.
- **Tunnel `trycloudflare` qui tombe** → relancez `shopify app dev` et rouvrez
  l'aperçu via la Dev Console.
- **Navigation qui casse l'app embarquée** → utilisez `Link`/`useSubmit` de
  `react-router` (pas de `<a>` ni `redirect` de react-router) ; utilisez le
  `redirect` renvoyé par `authenticate.admin`.

## Ressources

- [Shopify App React Router](https://shopify.dev/docs/api/shopify-app-react-router)
- [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components)
- [App Proxies](https://shopify.dev/docs/apps/build/online-store/app-proxies)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
