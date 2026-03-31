/**
 * useDictionary.js
 * Hook de gestion du dictionnaire d'affiliations.
 * Stockage : fichier JSON importable/exportable (via state React).
 *
 * Structure du dictionnaire :
 * {
 *   categories: {
 *     "Affiliations": { "variante 1": "Nom canonique", "variante 2": "Nom canonique" },
 *     "Pays": { ... },
 *     ...
 *   },
 *   meta: { createdAt, updatedAt, version }
 * }
 */

import { useState, useCallback } from "react";

const PREDEFINED_CATEGORIES = ["Affiliations", "Pays", "Laboratoires", "Établissements"];

const DEFAULT_DICTIONARY = {
  categories: Object.fromEntries(PREDEFINED_CATEGORIES.map((c) => [c, {}])),
  meta: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: "1.0",
  },
};

export function useDictionary() {
  const [dictionary, setDictionary] = useState(DEFAULT_DICTIONARY);

  // ── Lecture ──────────────────────────────────────────────

  /** Retourne toutes les catégories disponibles */
  const getCategories = useCallback(() => {
    return Object.keys(dictionary.categories);
  }, [dictionary]);

  /** Retourne les entrées d'une catégorie : { variante → canonique } */
  const getEntries = useCallback((category) => {
    return dictionary.categories[category] || {};
  }, [dictionary]);

  /**
   * Cherche une variante dans TOUTES les catégories.
   * Retourne { canonicalName, category } ou null.
   */
  const lookup = useCallback((variant) => {
    const key = variant.trim().toLowerCase();
    for (const [cat, entries] of Object.entries(dictionary.categories)) {
      for (const [v, canonical] of Object.entries(entries)) {
        if (v.trim().toLowerCase() === key) {
          return { canonicalName: canonical, category: cat };
        }
      }
    }
    return null;
  }, [dictionary]);

  /**
   * Pré-remplit les fusions connues depuis le dictionnaire.
   * Retourne { knownGroups, unknownAffiliations }
   * - knownGroups : groupes reconstituables depuis le dico
   * - unknownAffiliations : affiliations non trouvées dans le dico
   */
  const preProcess = useCallback((affiliations) => {
    // Regrouper les affiliations par leur nom canonique
    const canonicalMap = {}; // canonicalName → { variants[], category }

    const unknown = [];

    for (const aff of affiliations) {
      const found = lookup(aff);
      if (found) {
        const key = found.canonicalName;
        if (!canonicalMap[key]) {
          canonicalMap[key] = { variants: [], category: found.category, canonicalName: key };
        }
        canonicalMap[key].variants.push(aff);
      } else {
        unknown.push(aff);
      }
    }

    // Ne garder que les groupes avec au moins 2 variantes (vraie fusion)
    // Les singletons connus passent quand même pour info
    const knownGroups = Object.values(canonicalMap)
      .filter((g) => g.variants.length >= 1)
      .map((g) => ({
        variants: g.variants,
        merged_name: g.canonicalName,
        confidence: 1.0,
        fromDictionary: true,
        category: g.category,
      }));

    return { knownGroups, unknownAffiliations: unknown };
  }, [lookup]);

  // ── Écriture ─────────────────────────────────────────────

  /** Ajoute une catégorie */
  const addCategory = useCallback((name) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    setDictionary((prev) => {
      if (prev.categories[trimmed]) return prev;
      return {
        ...prev,
        categories: { ...prev.categories, [trimmed]: {} },
        meta: { ...prev.meta, updatedAt: new Date().toISOString() },
      };
    });
    return true;
  }, []);

  /** Ajoute des variantes → nom canonique dans une catégorie */
  const addEntries = useCallback((category, variants, canonicalName) => {
    setDictionary((prev) => {
      const catEntries = { ...(prev.categories[category] || {}) };
      for (const v of variants) {
        catEntries[v.trim()] = canonicalName.trim();
      }
      return {
        ...prev,
        categories: { ...prev.categories, [category]: catEntries },
        meta: { ...prev.meta, updatedAt: new Date().toISOString() },
      };
    });
  }, []);

  /** Supprime une entrée */
  const removeEntry = useCallback((category, variant) => {
    setDictionary((prev) => {
      const catEntries = { ...(prev.categories[category] || {}) };
      delete catEntries[variant];
      return {
        ...prev,
        categories: { ...prev.categories, [category]: catEntries },
        meta: { ...prev.meta, updatedAt: new Date().toISOString() },
      };
    });
  }, []);

  // ── Import / Export ───────────────────────────────────────

  const exportDictionary = useCallback(() => {
    const json = JSON.stringify(dictionary, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dictionnaire_affiliations_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [dictionary]);

  const importDictionary = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.categories) throw new Error("Format invalide : clé 'categories' manquante.");
          setDictionary({
            ...DEFAULT_DICTIONARY,
            ...data,
            meta: { ...data.meta, updatedAt: new Date().toISOString() },
          });
          resolve(data);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Erreur de lecture du fichier."));
      reader.readAsText(file);
    });
  }, []);

  const totalEntries = Object.values(dictionary.categories).reduce(
    (sum, cat) => sum + Object.keys(cat).length, 0
  );

  return {
    dictionary,
    getCategories,
    getEntries,
    lookup,
    preProcess,
    addCategory,
    addEntries,
    removeEntry,
    exportDictionary,
    importDictionary,
    totalEntries,
    PREDEFINED_CATEGORIES,
  };
}