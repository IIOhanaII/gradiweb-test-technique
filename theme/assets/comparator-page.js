/**
 * Page de comparaison (Partie A.3) — construction du tableau comparatif.
 *
 * Fichier séparé de comparator.js pour isoler la logique de la page (la plus
 * volumineuse) de l'état partagé et du drawer. Il s'appuie sur les helpers
 * exposés par comparator.js via `window.Comparator.shared` (transport
 * Storefront, GID, formatage) — comparator.js est chargé juste avant.
 *
 * Aucune donnée produit n'est rendue en Liquid (cf. énoncé) : le template
 * fournit une coquille, ce module remplit le tableau côté client.
 */
(function () {
  'use strict';

  const Comparator = window.Comparator;
  // Sécurité : si le cœur n'a pas pu se charger, on n'essaie rien.
  if (!Comparator || !Comparator.shared) return;

  const { storefrontFetch, toGid, numericId, formatMoney, T } = Comparator.shared;
  const cfg = window.COMPARATOR_CONFIG || {};

  // Libellés propres à la page (mêmes mécanisme et replis que le drawer).
  const P = Object.assign(
    {
      empty_title: 'Your comparison is empty',
      empty_text: 'Add products to compare them side by side.',
      empty_cta: 'Browse the shop',
      col_product: 'Product',
      col_price: 'Price',
      col_description: 'Description',
      col_variants: 'Available variants',
      col_stock: 'Availability',
      col_length: 'Length (cm)',
      col_weight: 'Weight (kg)',
      col_flex: 'Flex (1–10)',
      in_stock: 'In stock',
      out_of_stock: 'Out of stock',
      add_to_cart: 'Add to cart',
      choose_options: 'Choose options',
      added_to_cart: 'Added ✓',
      cart_error: 'Couldn’t add to cart. Please try again.',
      identical: 'Identical',
      single_option: 'Default',
      value_missing: '—',
    },
    (cfg.strings && cfg.strings.page) || {}
  );

  /** Formate un nombre de metafield en retirant les décimales superflues (152.0 → « 152 »). */
  function formatNumber(value) {
    if (value == null || value === '') return '';
    const n = Number(value);
    if (Number.isNaN(n)) return String(value);
    return String(Number(n.toFixed(2)));
  }

  /* ------------------------------------------------------------------ */
  /* Config dynamique (Partie C.1) — lue du metafield boutique          */
  /* ------------------------------------------------------------------ */

  // Doit rester aligné sur l'app admin (B.1 : comparator.ts). L'ordre fait foi.
  const CONFIG_FIELD_KEYS = [
    'price',
    'description',
    'variants',
    'stock',
    'weight',
    'custom_metafield',
  ];
  const CONFIG_DEFAULT_DISABLED = ['custom_metafield'];

  /** Config par défaut, servie tant que le marchand n'a rien enregistré. */
  function defaultCompareConfig() {
    return CONFIG_FIELD_KEYS.map((key) => ({
      key,
      enabled: CONFIG_DEFAULT_DISABLED.indexOf(key) === -1,
    }));
  }

  /**
   * Normalise la config lue du metafield (forme `{fields:[{key,enabled}]}`),
   * de façon tolérante (donnée distante non fiable) : on garde l'ordre stocké
   * des clés connues, on ignore les inconnues, on complète les manquantes.
   */
  function normalizeCompareConfig(raw) {
    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        parsed = null;
      }
    }
    if (!parsed || !Array.isArray(parsed.fields)) return defaultCompareConfig();

    const known = CONFIG_FIELD_KEYS;
    const seen = {};
    const fields = [];
    parsed.fields.forEach((item) => {
      if (item && known.indexOf(item.key) !== -1 && !seen[item.key]) {
        fields.push({ key: item.key, enabled: !!item.enabled });
        seen[item.key] = true;
      }
    });
    known.forEach((key) => {
      if (!seen[key]) fields.push({ key, enabled: CONFIG_DEFAULT_DISABLED.indexOf(key) === -1 });
    });
    return fields;
  }

  /**
   * Requête « détaillée » : ajoute description courte, variantes
   * (titre/dispo/stock), disponibilité et les 3 metafields snowboard
   * (custom.length/weight/flex) servant au surlignage des specs.
   */
  async function fetchProductsDetailed(items) {
    const query = `
      query CompareDetailed($ids: [ID!]!) {
        shop {
          metafield(namespace: "cosmiweb", key: "comparator_config") { value }
        }
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            handle
            onlineStoreUrl
            availableForSale
            description(truncateAt: 160)
            featuredImage { url(transform: { maxWidth: 600, maxHeight: 600, crop: CENTER }) altText }
            priceRange { minVariantPrice { amount currencyCode } }
            compareAtPriceRange { minVariantPrice { amount currencyCode } }
            variants(first: 20) {
              nodes { id title availableForSale quantityAvailable }
            }
            length: metafield(namespace: "custom", key: "length") { value type }
            weight: metafield(namespace: "custom", key: "weight") { value type }
            flex: metafield(namespace: "custom", key: "flex") { value type }
          }
        }
      }`;
    const data = await storefrontFetch(query, { ids: items.map(toGid) });
    const configValue = data.shop && data.shop.metafield ? data.shop.metafield.value : null;
    return {
      products: (data.nodes || []).filter(Boolean),
      config: normalizeCompareConfig(configValue),
    };
  }

  /**
   * Tracking (Partie C) : signale les produits comparés à l'app via l'App Proxy
   * (same-origin). Best-effort et non bloquant — un échec ne doit jamais
   * impacter l'affichage. `keepalive` permet l'envoi même si la page se ferme.
   */
  function trackComparison(ids) {
    if (!ids || !ids.length) return;
    const url = cfg.trackUrl || '/apps/comparator/track';
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids }),
        keepalive: true,
      }).catch(function () {});
    } catch (error) {
      /* best-effort */
    }
  }

  const Page = {
    refs: {},
    requestId: 0,
    tracked: false,

    /** Monte le module si le template de page est présent. @returns {boolean} */
    init() {
      const root = document.querySelector('[data-comparator-page]');
      if (!root) return false;
      this.refs = {
        root,
        body: root.querySelector('[data-comparator-page-body]'),
        clear: root.querySelector('[data-comparator-page-clear]'),
        collectionUrl: root.getAttribute('data-collection-url') || '/collections/all',
      };
      this.refs.clear.addEventListener('click', () => Comparator.clear());
      // Délégation : retrait d'une colonne + ajout au panier.
      this.refs.body.addEventListener('click', (event) => this.onBodyClick(event));
      this.render(Comparator.getItems());
      return true;
    },

    onChange(items) {
      this.render(items);
    },

    onBodyClick(event) {
      const remove = event.target.closest('[data-comparator-remove]');
      if (remove) {
        Comparator.remove(remove.getAttribute('data-comparator-remove'));
        return;
      }
      const addBtn = event.target.closest('[data-add-to-cart]');
      if (addBtn) this.addToCart(addBtn);
    },

    /** Récupère la sélection détaillée et rend l'état adéquat (vide/chargement/erreur/tableau). */
    async render(items) {
      const { body, clear } = this.refs;
      if (!items.length) {
        clear.hidden = true;
        body.innerHTML = '';
        body.appendChild(this.emptyState());
        return;
      }
      clear.hidden = false;

      const ticket = ++this.requestId;
      body.innerHTML = '';
      body.appendChild(this.stateEl(T.loading));

      try {
        const { products, config } = await fetchProductsDetailed(items);
        if (ticket !== this.requestId) return; // réponse périmée

        // Purge des fantômes : ids stockés mais introuvables côté API.
        const foundIds = new Set(products.map((p) => numericId(p.id)));
        items.forEach((item) => {
          if (!foundIds.has(String(item.id))) Comparator.remove(item.id);
        });

        body.innerHTML = '';
        body.appendChild(
          products.length ? this.buildTable(products, config) : this.emptyState(),
        );

        // Tracking une seule fois par chargement de page (énoncé : « à chaque
        // chargement de la page de comparaison »), pas à chaque retrait/ajout.
        if (!this.tracked && products.length) {
          this.tracked = true;
          trackComparison(products.map((p) => numericId(p.id)));
        }
      } catch (error) {
        if (ticket !== this.requestId) return;
        body.innerHTML = '';
        const message = error.message === 'missing-token' ? T.errorConfig : T.error;
        body.appendChild(this.stateEl(message, true));
      }
    },

    /** État vide élégant avec CTA retour boutique. */
    emptyState() {
      const wrap = document.createElement('div');
      wrap.className = 'comparator-page__empty';
      const title = document.createElement('p');
      title.className = 'comparator-page__empty-title';
      title.textContent = P.empty_title;
      const text = document.createElement('p');
      text.className = 'comparator-page__empty-text';
      text.textContent = P.empty_text;
      const cta = document.createElement('a');
      cta.className = 'comparator-page__empty-cta button';
      cta.href = this.refs.collectionUrl;
      cta.textContent = P.empty_cta;
      wrap.append(title, text, cta);
      return wrap;
    },

    stateEl(message, isError) {
      const p = document.createElement('p');
      p.className = isError ? 'comparator-state comparator-state--error' : 'comparator-state';
      p.textContent = message;
      return p;
    },

    /* --- Construction du tableau ------------------------------------ */

    /**
     * Assemble le tableau. Les lignes sont pilotées par la **config admin** (B.1) :
     * seuls les champs activés sont affichés, dans l'ordre choisi. Mapping des
     * clés de config vers les lignes (un champ peut produire plusieurs lignes) :
     * weight → poids ; `custom_metafield` → les metafields snowboard length + flex.
     * Image/titre (en-tête) et « Ajouter au panier » sont structurels (toujours là).
     *
     * Chaque ligne calcule si toutes les valeurs sont identiques (→ atténuée +
     * badge « Identique ») ou différentes (→ surlignage de la meilleure cellule
     * pour les specs orientées : prix/poids au plus bas, flex au plus haut ;
     * longueur neutre).
     */
    buildTable(products, config) {
      const rowsByKey = {
        price: [{ label: P.col_price, direction: 'min', cells: products.map((p) => this.priceCell(p)) }],
        description: [{ label: P.col_description, direction: null, cells: products.map((p) => this.descCell(p)) }],
        variants: [{ label: P.col_variants, direction: null, cells: products.map((p) => this.variantsCell(p)) }],
        stock: [{ label: P.col_stock, direction: null, cells: products.map((p) => this.stockCell(p)) }],
        weight: [{ label: P.col_weight, direction: 'min', cells: products.map((p) => this.specCell(p, 'weight')) }],
        custom_metafield: [
          { label: P.col_length, direction: null, cells: products.map((p) => this.specCell(p, 'length')) },
          { label: P.col_flex, direction: 'max', cells: products.map((p) => this.specCell(p, 'flex')) },
        ],
      };

      const rows = [];
      (config || defaultCompareConfig()).forEach((field) => {
        if (field.enabled && rowsByKey[field.key]) {
          rowsByKey[field.key].forEach((row) => rows.push(row));
        }
      });

      const table = document.createElement('table');
      table.className = 'comparator-table';

      const thead = document.createElement('thead');
      const headTr = document.createElement('tr');
      const corner = document.createElement('td');
      corner.className = 'comparator-table__corner';
      headTr.appendChild(corner);
      products.forEach((product) => headTr.appendChild(this.productHeadCell(product)));
      thead.appendChild(headTr);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      rows.forEach((row) => tbody.appendChild(this.dataRow(row)));
      tbody.appendChild(this.actionRow(products));
      table.appendChild(tbody);

      // Enveloppe à défilement horizontal : responsive sans casser les colonnes.
      const scroller = document.createElement('div');
      scroller.className = 'comparator-table__scroll';
      scroller.appendChild(table);
      return scroller;
    },

    /** En-tête de colonne : carte produit (retrait + image + titre). */
    productHeadCell(product) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.className = 'comparator-table__product';
      const href = product.onlineStoreUrl || `/products/${product.handle}`;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'comparator-table__remove';
      remove.setAttribute('data-comparator-remove', numericId(product.id));
      remove.setAttribute('aria-label', T.remove.replace('{title}', product.title));
      remove.textContent = '×';

      const media = document.createElement('a');
      media.className = 'comparator-table__media';
      media.href = href;
      if (product.featuredImage) {
        const img = document.createElement('img');
        img.src = product.featuredImage.url;
        img.alt = product.featuredImage.altText || product.title;
        img.loading = 'lazy';
        media.appendChild(img);
      }

      const title = document.createElement('a');
      title.className = 'comparator-table__title';
      title.href = href;
      title.textContent = product.title;

      th.append(remove, media, title);
      return th;
    },

    /** Ligne de critère : calcule identique/différent + meilleures cellules, puis rend. */
    dataRow(row) {
      const norm = row.cells.map((c) => (c.cmp == null ? '' : String(c.cmp).trim().toLowerCase()));
      const allEqual = norm.every((v) => v === norm[0]);

      const winners = new Set();
      if (!allEqual && row.direction) {
        const nums = row.cells.map((c) => c.num);
        const valid = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n));
        if (valid.length) {
          const best = row.direction === 'min' ? Math.min(...valid) : Math.max(...valid);
          row.cells.forEach((c, i) => {
            if (c.num === best) winners.add(i);
          });
        }
      }

      const tr = document.createElement('tr');
      tr.className = allEqual ? 'is-identical' : 'is-different';

      const th = document.createElement('th');
      th.scope = 'row';
      th.className = 'comparator-table__label';
      th.appendChild(document.createTextNode(row.label));
      if (allEqual) {
        const badge = document.createElement('span');
        badge.className = 'comparator-table__badge';
        badge.textContent = P.identical;
        th.appendChild(badge);
      }
      tr.appendChild(th);

      row.cells.forEach((cell, i) => {
        const td = document.createElement('td');
        td.className = 'comparator-table__cell';
        if (!allEqual && winners.has(i)) td.classList.add('is-best');
        td.appendChild(cell.node);
        tr.appendChild(td);
      });
      return tr;
    },

    /** Ligne d'action « Ajouter au panier » (hors logique identique/différent). */
    actionRow(products) {
      const tr = document.createElement('tr');
      tr.className = 'comparator-table__actions';
      const th = document.createElement('th');
      th.scope = 'row';
      th.className = 'comparator-table__label';
      tr.appendChild(th);
      products.forEach((product) => {
        const td = document.createElement('td');
        td.className = 'comparator-table__cell';
        td.appendChild(this.cartControl(product));
        tr.appendChild(td);
      });
      return tr;
    },

    /* --- Cellules (chacune renvoie { node, cmp, num }) -------------- */

    priceCell(product) {
      const wrap = document.createElement('div');
      wrap.className = 'comparator-price';
      const current = product.priceRange && product.priceRange.minVariantPrice;
      const compareAt = product.compareAtPriceRange && product.compareAtPriceRange.minVariantPrice;
      const currentEl = document.createElement('span');
      currentEl.className = 'comparator-price__current';
      currentEl.textContent = formatMoney(current);
      wrap.appendChild(currentEl);
      if (compareAt && current && Number(compareAt.amount) > Number(current.amount)) {
        const was = document.createElement('s');
        was.className = 'comparator-price__was';
        was.textContent = formatMoney(compareAt);
        wrap.appendChild(was);
      }
      return { node: wrap, cmp: current ? current.amount : '', num: current ? Number(current.amount) : null };
    },

    /** Cellule de metafield numérique (length/weight/flex). */
    specCell(product, key) {
      const mf = product[key];
      const raw = mf && mf.value;
      const has = raw != null && raw !== '';
      const span = document.createElement('span');
      span.textContent = has ? formatNumber(raw) : P.value_missing;
      if (!has) span.classList.add('comparator-cell--missing');
      return { node: span, cmp: has ? formatNumber(raw) : '', num: has ? Number(raw) : null };
    },

    descCell(product) {
      const p = document.createElement('p');
      p.className = 'comparator-desc';
      p.textContent = product.description || P.value_missing;
      if (!product.description) p.classList.add('comparator-cell--missing');
      return { node: p, cmp: product.description || '', num: null };
    },

    variantsCell(product) {
      const variants = (product.variants && product.variants.nodes) || [];
      const available = variants.filter((v) => v.availableForSale);
      // Titres parlants : on masque le « Default Title » des produits mono-variante.
      const titles = available.map((v) => v.title).filter((t) => t && t !== 'Default Title');
      let display;
      if (titles.length) display = titles.join(', ');
      else if (available.length) display = P.single_option;
      else display = P.value_missing;
      const span = document.createElement('span');
      span.textContent = display;
      return { node: span, cmp: display, num: null };
    },

    stockCell(product) {
      const inStock = !!product.availableForSale;
      const badge = document.createElement('span');
      badge.className = inStock ? 'comparator-stock is-in' : 'comparator-stock is-out';
      badge.textContent = inStock ? P.in_stock : P.out_of_stock;
      return { node: badge, cmp: inStock ? 'in' : 'out', num: null };
    },

    /** Bouton panier : ajout direct (mono-variante), choix d'options (multi) ou rupture. */
    cartControl(product) {
      const variants = (product.variants && product.variants.nodes) || [];
      const available = variants.filter((v) => v.availableForSale);
      const href = product.onlineStoreUrl || `/products/${product.handle}`;

      if (!product.availableForSale || !available.length) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'button comparator-cart__btn';
        btn.disabled = true;
        btn.textContent = P.out_of_stock;
        return btn;
      }
      if (variants.length > 1) {
        const link = document.createElement('a');
        link.className = 'button comparator-cart__btn';
        link.href = href;
        link.textContent = P.choose_options;
        return link;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'button comparator-cart__btn';
      btn.setAttribute('data-add-to-cart', numericId(available[0].id));
      btn.textContent = P.add_to_cart;
      return btn;
    },

    /**
     * Ajout au panier en réutilisant le mécanisme natif de Dawn : on demande le
     * rendu des mêmes sections que le cart-drawer (mise à jour tiroir + compteur
     * d'en-tête) et on publie `cartUpdate`, exactement comme un ajout depuis une
     * fiche produit. Repli silencieux si ces utilitaires ne sont pas chargés.
     */
    async addToCart(btn) {
      const id = btn.getAttribute('data-add-to-cart');
      if (!id || btn.classList.contains('is-loading')) return;
      const original = btn.textContent;
      btn.classList.add('is-loading');
      btn.disabled = true;

      const cart =
        document.querySelector('cart-notification') || document.querySelector('cart-drawer');

      // On reproduit fidèlement la requête de <product-form> de Dawn : FormData +
      // suppression du Content-Type (le navigateur pose alors multipart/form-data).
      // Poster un corps JSON avec un Content-Type « javascript » rendait le rendu
      // des `sections` non fiable → au 1er ajout (panier vide), le tiroir restait
      // en état « vide » alors que le total s'incrémentait.
      const config =
        typeof fetchConfig === 'function'
          ? fetchConfig('javascript')
          : { method: 'POST', headers: { Accept: 'application/javascript' } };
      config.headers['X-Requested-With'] = 'XMLHttpRequest';
      delete config.headers['Content-Type'];

      const formData = new FormData();
      formData.append('id', id);
      formData.append('quantity', '1');
      if (cart && typeof cart.getSectionsToRender === 'function') {
        formData.append('sections', cart.getSectionsToRender().map((section) => section.id));
        formData.append('sections_url', window.location.pathname);
        if (typeof cart.setActiveElement === 'function') cart.setActiveElement(btn);
      }
      config.body = formData;

      const url = (window.routes && window.routes.cart_add_url) || '/cart/add';

      try {
        const response = await fetch(url, config);
        const data = await response.json();
        // L'API Cart renvoie un objet d'erreur porteur de `status` (ex. 422 rupture).
        if (data.status) throw new Error(data.description || data.message || 'cart');

        if (cart && typeof cart.renderContents === 'function') {
          // Dawn ne retire `is-empty` que de `.drawer__inner` ; sur ce thème la classe
          // est aussi portée par l'élément hôte <cart-drawer>. On la retire ici pour la
          // transition panier vide → non vide (sinon le tiroir reste « vide » au 1er ajout).
          cart.classList.remove('is-empty');
          cart.renderContents(data);
        }
        if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
          publish(PUB_SUB_EVENTS.cartUpdate, {
            source: 'comparator-page',
            productVariantId: String(id),
          });
        }

        btn.classList.remove('is-loading');
        btn.classList.add('is-added');
        btn.textContent = P.added_to_cart;
      } catch (error) {
        btn.classList.remove('is-loading');
        btn.disabled = false;
        btn.textContent = P.cart_error;
        window.setTimeout(() => {
          btn.textContent = original;
        }, 2500);
      }
    },
  };

  function onComparatorChange(event) {
    const items = (event.detail && event.detail.items) || Comparator.getItems();
    Page.onChange(items);
  }

  function start() {
    // On ne s'abonne qu'une fois la page montée (évite tout travail ailleurs).
    if (Page.init()) {
      document.addEventListener('comparator:change', onComparatorChange);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
