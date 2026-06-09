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

  function init() {
    const buttons = document.querySelectorAll('[data-compare-button]');
    buttons.forEach((button) => button.addEventListener('click', onButtonClick));
    renderAllButtons();
  }

  // Tous les boutons (et plus tard le drawer) se resynchronisent à chaque
  // changement, y compris si la sélection est modifiée dans un autre onglet.
  document.addEventListener('comparator:change', renderAllButtons);
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) renderAllButtons();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
