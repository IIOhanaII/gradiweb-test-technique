# COMPTE-RENDU — Comparateur de produits Shopify

> Test technique Cosmiweb — Développeur Fullstack E-commerce (Shopify)

## Liens & accès

- **Repository GitHub** : https://github.com/IIOhanaII/gradiweb-test-technique
- **Store de développement** : `gradiweb-test.myshopify.com` _(staff account communiqué par email à l'évaluateur)_
- **App déployée** : _(URL Fly.io — à compléter)_

---

## 1. Résumé de l'approche

### Partie A — Front-end (thème)
_À compléter au fil de l'implémentation._

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

_Entrées ajoutées au fil de l'eau._
