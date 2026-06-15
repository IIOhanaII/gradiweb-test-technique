# Comparateur de produits Shopify

Application Shopify de comparaison de produits, couvrant le storefront (thème) et le back-office (app embarquée). Réalisée dans le cadre d'un test technique Cosmiweb.

> 📄 **Le document évalué est [`COMPTE-RENDU.md`](COMPTE-RENDU.md)** — approche, choix techniques, difficultés et journal d'usage de l'IA.

## Liens

- **App déployée** : https://comparator-app.fly.dev (Fly.io)
- **Store de développement** : `gradiweb-test.myshopify.com` _(staff account communiqué par email)_

## Structure du dépôt

```
theme/            → Partie A : thème Shopify (sections, snippets, templates, assets du comparateur)
app/              → Parties B & C : app embarquée React Router 7 (App Bridge + Polaris + Admin API)
COMPTE-RENDU.md   → compte-rendu évalué (approche, choix, difficultés, journal IA)
```

## Thème (Partie A)

Le thème vit dans `theme/`. Commandes depuis la racine (Shopify CLI requis) :

```bash
npm run dev     # serveur de dev local sur le store gradiweb-test
npm run push    # pousse le thème vers le store
npm run check   # Theme Check (lint Liquid)
```

## App embarquée (Parties B & C)

Installation, lancement et déploiement détaillés dans [`app/README.md`](app/README.md).
