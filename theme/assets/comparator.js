/**
 * Comparateur de produits — module d'état partagé (storefront).
 *
 * Source de vérité unique de la sélection de comparaison, persistée dans
 * localStorage. On ne stocke QUE l'identité du produit ({ id, handle }) :
 * les données d'affichage (titre, prix, image…) sont récupérées via l'API
 * Storefront GraphQL par le drawer (A.2) et la page de comparaison (A.3).
 * Cela évite de figer des données produit en localStorage et garantit leur
 * fraîcheur.
 *
 * Le module expose `window.Comparator` et émet un évènement
 * `comparator:change` sur `document` à chaque mutation, pour que le bouton,
 * le drawer et la page réagissent sans se connaître entre eux.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'cosmiweb:compare';
  const MAX_ITEMS = 4;

  /** Lit la sélection depuis localStorage en tolérant les données corrompues. */
  function read() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // On ne garde que des entrées valides { id, handle }.
      return parsed.filter(
        (item) => item && item.id != null && typeof item.handle === 'string'
      );
    } catch (error) {
      // localStorage indisponible (navigation privée, quota) ou JSON cassé :
      // on dégrade proprement vers une liste vide plutôt que de planter l'UI.
      return [];
    }
  }

  /** Écrit la sélection et notifie les abonnés. */
  function write(items) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      // Si l'écriture échoue, l'état en mémoire reste cohérent le temps de la
      // page ; on notifie quand même pour rafraîchir l'UI.
    }
    document.dispatchEvent(
      new CustomEvent('comparator:change', { detail: { items } })
    );
  }

  const Comparator = {
    MAX_ITEMS,

    /** @returns {Array<{id:string|number, handle:string}>} */
    getItems() {
      return read();
    },

    count() {
      return read().length;
    },

    has(id) {
      return read().some((item) => String(item.id) === String(id));
    },

    isFull() {
      return read().length >= MAX_ITEMS;
    },

    /**
     * Ajoute un produit s'il reste de la place et qu'il n'est pas déjà présent.
     * @returns {boolean} true si l'ajout a eu lieu.
     */
    add(item) {
      if (!item || item.id == null) return false;
      const items = read();
      if (items.some((existing) => String(existing.id) === String(item.id))) {
        return false;
      }
      if (items.length >= MAX_ITEMS) return false;
      items.push({ id: item.id, handle: item.handle });
      write(items);
      return true;
    },

    /** Retire un produit par son id. @returns {boolean} true si retiré. */
    remove(id) {
      const items = read();
      const next = items.filter((item) => String(item.id) !== String(id));
      if (next.length === items.length) return false;
      write(next);
      return true;
    },

    /** Bascule la présence d'un produit. @returns {boolean} nouvel état (présent ?). */
    toggle(item) {
      if (this.has(item.id)) {
        this.remove(item.id);
        return false;
      }
      return this.add(item);
    },

    clear() {
      write([]);
    },
  };

  window.Comparator = Comparator;

  /* ------------------------------------------------------------------ */
  /* Liaison des boutons « Ajouter à la comparaison » (A.1)             */
  /* ------------------------------------------------------------------ */

  /** Met à jour le rendu d'un bouton en fonction de l'état courant. */
  function renderButton(button) {
    const id = button.dataset.compareId;
    const labelEl = button.querySelector('[data-compare-label]');
    const hintEl = button.parentElement.querySelector('[data-compare-hint]');

    const isActive = Comparator.has(id);
    const isFull = Comparator.isFull();
    // Désactivé uniquement si la liste est pleine ET que ce produit n'y est pas
    // (sinon on doit toujours pouvoir le retirer).
    const isDisabled = isFull && !isActive;

    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
    button.disabled = isDisabled;

    if (labelEl) {
      labelEl.textContent = isActive
        ? button.dataset.labelAdded
        : button.dataset.labelAdd;
    }

    if (hintEl) {
      if (isDisabled) {
        hintEl.textContent = button.dataset.labelFull;
        hintEl.hidden = false;
      } else {
        hintEl.hidden = true;
      }
    }
  }

  function renderAllButtons() {
    document.querySelectorAll('[data-compare-button]').forEach(renderButton);
  }

  function onButtonClick(event) {
    const button = event.currentTarget;
    Comparator.toggle({
      id: button.dataset.compareId,
      handle: button.dataset.compareHandle,
    });
    // Le re-render se fait via l'évènement comparator:change ci-dessous.
  }

  /* ------------------------------------------------------------------ */
  /* Drawer + première requête Storefront GraphQL (A.2)                 */
  /* ------------------------------------------------------------------ */

  const cfg = window.COMPARATOR_CONFIG || {};

  // Libellés issus des locales du thème (injectés via theme.liquid). Replis
  // anglais défensifs au cas où la config ne serait pas chargée.
  const T = Object.assign(
    {
      empty: 'No products selected yet.',
      loading: 'Loading…',
      error: 'Couldn’t load products. Please try again later.',
      errorConfig: 'Comparator not set up: add the Storefront token in theme settings.',
      remove: 'Remove {title}',
    },
    cfg.strings || {}
  );

  /** Construit un GID Storefront à partir de l'id numérique stocké. */
  function toGid(item) {
    const id = String(item.id);
    return id.startsWith('gid://') ? id : `gid://shopify/Product/${id}`;
  }

  /** Extrait l'id numérique d'un GID (dernier segment) pour le rapprocher du store. */
  function numericId(gid) {
    return String(gid).split('/').pop();
  }

  /** Formate un objet {amount, currencyCode} selon la locale de la page. */
  function formatMoney(price) {
    if (!price) return '';
    const amount = Number(price.amount);
    try {
      return new Intl.NumberFormat(document.documentElement.lang || 'en', {
        style: 'currency',
        currency: price.currencyCode,
      }).format(amount);
    } catch (error) {
      return `${amount.toFixed(2)} ${price.currencyCode}`;
    }
  }

  /**
   * Récupère en une requête les produits de la sélection via l'API Storefront.
   * `nodes(ids:)` préserve l'ordre demandé et renvoie null pour un produit
   * introuvable (dépublié/supprimé), qu'on filtre côté client.
   */
  async function fetchProducts(items) {
    if (!cfg.storefrontToken) {
      throw new Error('missing-token');
    }
    const endpoint = `https://${cfg.shopDomain}/api/${cfg.apiVersion}/graphql.json`;
    const query = `
      query CompareItems($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            handle
            onlineStoreUrl
            featuredImage { url(transform: { maxWidth: 128, maxHeight: 128, crop: CENTER }) altText }
            priceRange { minVariantPrice { amount currencyCode } }
            compareAtPriceRange { minVariantPrice { amount currencyCode } }
          }
        }
      }`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': cfg.storefrontToken,
      },
      body: JSON.stringify({ query, variables: { ids: items.map(toGid) } }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.errors && payload.errors.length) {
      throw new Error(payload.errors.map((e) => e.message).join('; ') || 'GraphQL error');
    }
    return (payload.data.nodes || []).filter(Boolean);
  }

  const Drawer = {
    refs: {},
    isOpen: false,
    lastFocused: null,
    requestId: 0,

    init() {
      const root = document.querySelector('[data-comparator]');
      if (!root) return;
      this.refs = {
        root,
        launcher: root.querySelector('[data-comparator-open]'),
        overlay: root.querySelector('[data-comparator-overlay]'),
        panel: root.querySelector('#comparator-drawer'),
        body: root.querySelector('[data-comparator-body]'),
        counts: root.querySelectorAll('[data-comparator-count]'),
        close: root.querySelector('[data-comparator-close]'),
        clear: root.querySelector('[data-comparator-clear]'),
      };

      this.refs.launcher.addEventListener('click', () => this.open());
      this.refs.close.addEventListener('click', () => this.close());
      this.refs.overlay.addEventListener('click', () => this.close());
      this.refs.clear.addEventListener('click', () => Comparator.clear());
      // Délégation : un seul écouteur pour tous les boutons « retirer ».
      this.refs.body.addEventListener('click', (event) => {
        const remove = event.target.closest('[data-comparator-remove]');
        if (remove) Comparator.remove(remove.getAttribute('data-comparator-remove'));
      });

      this.onChange(Comparator.getItems());
    },

    /** Met à jour le compteur + la visibilité du lanceur (peu coûteux). */
    onChange(items) {
      const count = items.length;
      this.refs.counts.forEach((el) => {
        el.textContent = String(count);
      });
      this.refs.launcher.hidden = count === 0;
      if (count === 0 && this.isOpen) {
        this.close();
      } else if (this.isOpen) {
        this.renderBody(items);
      }
    },

    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.lastFocused = document.activeElement;
      const { overlay, panel } = this.refs;
      overlay.hidden = false;
      panel.hidden = false;
      panel.setAttribute('aria-hidden', 'false');
      // Force un reflow pour que la transition d'entrée s'applique.
      void panel.offsetWidth;
      overlay.classList.add('is-visible');
      panel.classList.add('is-open');
      document.documentElement.style.overflow = 'hidden';
      document.addEventListener('keydown', this.onKeydown);
      this.refs.close.focus();
      this.renderBody(Comparator.getItems());
    },

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      const { overlay, panel } = this.refs;
      overlay.classList.remove('is-visible');
      panel.classList.remove('is-open');
      panel.setAttribute('aria-hidden', 'true');
      document.documentElement.style.overflow = '';
      document.removeEventListener('keydown', this.onKeydown);
      const onEnd = () => {
        if (!this.isOpen) {
          overlay.hidden = true;
          panel.hidden = true;
        }
        panel.removeEventListener('transitionend', onEnd);
      };
      panel.addEventListener('transitionend', onEnd);
      if (this.lastFocused && this.lastFocused.focus) this.lastFocused.focus();
    },

    /** Esc ferme ; Tab reste piégé dans le panneau (accessibilité dialog). */
    onKeydown: function (event) {
      if (event.key === 'Escape') {
        Drawer.close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = Drawer.refs.panel.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },

    /** Récupère et affiche le contenu du drawer ; gère les états transverses. */
    async renderBody(items) {
      const { body } = this.refs;
      if (!items.length) {
        body.innerHTML = '';
        body.appendChild(this.stateEl(T.empty));
        return;
      }

      const ticket = ++this.requestId;
      body.innerHTML = '';
      body.appendChild(this.stateEl(T.loading));

      try {
        const products = await fetchProducts(items);
        if (ticket !== this.requestId) return; // réponse périmée, ignorée

        // Purge des « fantômes » : produits stockés mais introuvables côté API.
        const foundIds = new Set(products.map((p) => numericId(p.id)));
        items.forEach((item) => {
          if (!foundIds.has(String(item.id))) Comparator.remove(item.id);
        });

        const list = document.createElement('ul');
        list.className = 'comparator-list';
        products.forEach((product) => list.appendChild(this.itemEl(product)));
        body.innerHTML = '';
        body.appendChild(list);
      } catch (error) {
        if (ticket !== this.requestId) return;
        body.innerHTML = '';
        const message = error.message === 'missing-token' ? T.errorConfig : T.error;
        body.appendChild(this.stateEl(message, true));
      }
    },

    /** Construit l'élément d'un produit (DOM, pas d'innerHTML → titres sûrs). */
    itemEl(product) {
      const li = document.createElement('li');
      li.className = 'comparator-item';
      li.dataset.id = numericId(product.id);

      const href = product.onlineStoreUrl || `/products/${product.handle}`;

      const media = document.createElement('a');
      media.className = 'comparator-item__media';
      media.href = href;
      if (product.featuredImage) {
        const img = document.createElement('img');
        img.src = product.featuredImage.url;
        img.alt = product.featuredImage.altText || product.title;
        img.loading = 'lazy';
        img.width = 64;
        img.height = 64;
        media.appendChild(img);
      }

      const info = document.createElement('div');
      info.className = 'comparator-item__info';

      const title = document.createElement('a');
      title.className = 'comparator-item__title';
      title.href = href;
      title.textContent = product.title;
      info.appendChild(title);

      const priceWrap = document.createElement('div');
      priceWrap.className = 'comparator-item__price';
      const current = product.priceRange && product.priceRange.minVariantPrice;
      const compareAt = product.compareAtPriceRange && product.compareAtPriceRange.minVariantPrice;
      const currentEl = document.createElement('span');
      currentEl.className = 'comparator-item__price-current';
      currentEl.textContent = formatMoney(current);
      priceWrap.appendChild(currentEl);
      if (compareAt && Number(compareAt.amount) > Number(current.amount)) {
        const was = document.createElement('s');
        was.className = 'comparator-item__price-was';
        was.textContent = formatMoney(compareAt);
        priceWrap.appendChild(was);
      }
      info.appendChild(priceWrap);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'comparator-item__remove';
      remove.setAttribute('data-comparator-remove', numericId(product.id));
      // T.remove est un gabarit localisé « Remove {title} » : on interpole côté
      // JS (le placeholder {title} en simple accolade n'est pas touché par `t`).
      remove.setAttribute('aria-label', T.remove.replace('{title}', product.title));
      remove.textContent = '×';

      li.append(media, info, remove);
      return li;
    },

    stateEl(message, isError) {
      const p = document.createElement('p');
      p.className = isError ? 'comparator-state comparator-state--error' : 'comparator-state';
      p.textContent = message;
      return p;
    },
  };

  function init() {
    const buttons = document.querySelectorAll('[data-compare-button]');
    buttons.forEach((button) => button.addEventListener('click', onButtonClick));
    renderAllButtons();
    Drawer.init();
  }

  /** Réagit à toute mutation de la sélection (clic local OU autre onglet). */
  function onComparatorChange(event) {
    const items = (event.detail && event.detail.items) || Comparator.getItems();
    renderAllButtons();
    Drawer.onChange(items);
  }

  document.addEventListener('comparator:change', onComparatorChange);
  // Autre onglet : on rejoue le même canal pour resynchroniser boutons + drawer.
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) onComparatorChange({ detail: { items: Comparator.getItems() } });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
