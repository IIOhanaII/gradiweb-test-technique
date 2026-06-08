# Comparateur de produits Shopify

Application Shopify de comparaison de produits, couvrant le storefront (thème) et le back-office (app embarquée). Réalisée dans le cadre d'un test technique Cosmiweb.

## Structure du dépôt

```
theme/   → Partie A : thème Shopify (sections, snippets, templates, assets du comparateur)
app/     → Partie B : app embarquée Remix (App Bridge + Polaris + API Admin)
COMPTE-RENDU.md → compte-rendu évalué (approche, choix, difficultés, journal IA)
```

## Thème (Partie A)

Le thème vit dans `theme/`. Commandes depuis la racine (Shopify CLI requis) :

```bash
npm run dev     # serveur de dev local sur le store gradiweb-test
npm run push    # pousse le thème vers le store
npm run check   # Theme Check (lint Liquid)
```

## App embarquée (Partie B)

Instructions d'installation et de lancement détaillées dans [`app/README.md`](app/README.md) _(à venir)_.

## Store de développement

- `gradiweb-test.myshopify.com`
