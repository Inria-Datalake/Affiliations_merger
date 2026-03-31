/**
 * useDictionary.js
 * Hook de gestion du dictionnaire d'affiliations.
 * - Persistance automatique dans localStorage
 * - Import / Export JSON
 * - Pré-traitement : déduplication exacte + pré-remplissage depuis le dico
 *
 * Structure :
 * {
 *   categories: { "Affiliations": { "variante": "canonique", ... }, ... },
 *   meta: { createdAt, updatedAt, version }
 * }
 */

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "affiliation_merger_dictionary";
const PREDEFINED_CATEGORIES = ["Affiliations", "Pays", "Laboratoires", "Établissements"];

const DEFAULT_DICTIONARY = {
  categories: Object.fromEntries(PREDEFINED_CATEGORIES.map((c) => [c, {}])),
  meta: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: "1.0",
  },
};

/** Charge le dictionnaire depuis localStorage, ou retourne le défaut */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DICTIONARY;
    const parsed = JSON.parse(raw);
    // S'assurer que toutes les catégories prédéfinies existent
    const categories = { ...parsed.categories };
    for (const cat of PREDEFINED_CATEGORIES) {
      if (!categories[cat]) categories[cat] = {};
    }
    return { ...parsed, categories };
  } catch {
    return DEFAULT_DICTIONARY;
  }
}

/** Sauvegarde dans localStorage */
function saveToStorage(dict) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dict));
  } catch (e) {
    console.warn("localStorage plein ou indisponible :", e);
  }
}

export function useDictionary() {
  const [dictionary, setDictionaryState] = useState(() => loadFromStorage());

  // Wrapper qui sauvegarde automatiquement à chaque modification
  const setDictionary = useCallback((updater) => {
    setDictionaryState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveToStorage(next);
      return next;
    });
  }, []);

  // ── Lecture ──────────────────────────────────────────────────

  const getCategories = useCallback(() => Object.keys(dictionary.categories), [dictionary]);

  const getEntries = useCallback((category) => dictionary.categories[category] || {}, [dictionary]);

  /** Cherche une variante dans toutes les catégories */
  const lookup = useCallback((variant) => {
    const key = variant.trim().toLowerCase();
    for (const [cat, entries] of Object.entries(dictionary.categories)) {
      for (const [v, canonical] of Object.entries(entries)) {
        if (v.trim().toLowerCase() === key) return { canonicalName: canonical, category: cat };
      }
    }
    return null;
  }, [dictionary]);

  // ── Pré-traitement ───────────────────────────────────────────

  /**
   * 1. Déduplication exacte (case-insensitive, espaces normalisés)
   * 2. Détection des affiliations multi-organismes (séparateur ; ou ,)
   * 3. Pré-remplissage depuis le dictionnaire
   *
   * Retourne :
   * {
   *   knownGroups,          // groupes issus du dictionnaire
   *   unknownAffiliations,  // à envoyer à l'IA
   *   exactDuplicates,      // doublons exacts fusionnés (stats)
   *   multiOrgCandidates,   // affiliations multi-organismes détectées
   * }
   */
  const preProcess = useCallback((affiliations) => {
    // ── Étape 1 : normalisation et déduplication exacte ──────
    const normalizeStr = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();

    const seen = new Map(); // normalized → original le plus fréquent
    const exactDuplicates = [];

    for (const aff of affiliations) {
      const norm = normalizeStr(aff);
      if (seen.has(norm)) {
        exactDuplicates.push({ duplicate: aff, canonical: seen.get(norm) });
      } else {
        seen.set(norm, aff);
      }
    }

    const deduplicated = [...seen.values()];

    // ── Étape 2 : détection multi-organismes ────────────────
    // Détecte les affiliations qui contiennent plusieurs orgs séparées par ; ou " , "
    const MULTI_SEP = /\s*;\s*/;
    const multiOrgCandidates = deduplicated
      .filter((aff) => MULTI_SEP.test(aff))
      .map((aff) => ({
        original: aff,
        parts: aff.split(MULTI_SEP).map((p) => p.trim()).filter(Boolean),
      }));

    // ── Étape 3 : pré-remplissage dictionnaire ───────────────
    const canonicalMap = {};
    const unknown = [];

    for (const aff of deduplicated) {
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

    const knownGroups = Object.values(canonicalMap).map((g) => ({
      variants: g.variants,
      merged_name: g.canonicalName,
      confidence: 1.0,
      fromDictionary: true,
      category: g.category,
    }));

    return { knownGroups, unknownAffiliations: unknown, exactDuplicates, multiOrgCandidates };
  }, [lookup]);

  // ── Écriture ─────────────────────────────────────────────────

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
  }, [setDictionary]);

  const addEntries = useCallback((category, variants, canonicalName) => {
    setDictionary((prev) => {
      const catEntries = { ...(prev.categories[category] || {}) };
      for (const v of variants) catEntries[v.trim()] = canonicalName.trim();
      return {
        ...prev,
        categories: { ...prev.categories, [category]: catEntries },
        meta: { ...prev.meta, updatedAt: new Date().toISOString() },
      };
    });
  }, [setDictionary]);

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
  }, [setDictionary]);

  const clearDictionary = useCallback(() => {
    setDictionary({ ...DEFAULT_DICTIONARY, meta: { ...DEFAULT_DICTIONARY.meta, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
  }, [setDictionary]);

  // ── Import / Export ───────────────────────────────────────────

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
          const merged = {
            ...DEFAULT_DICTIONARY,
            ...data,
            meta: { ...data.meta, updatedAt: new Date().toISOString() },
          };
          setDictionary(merged);
          resolve(merged);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error("Erreur de lecture."));
      reader.readAsText(file);
    });
  }, [setDictionary]);

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
    clearDictionary,
    exportDictionary,
    importDictionary,
    totalEntries,
    PREDEFINED_CATEGORIES,
    lastUpdated: dictionary.meta?.updatedAt,
  };
}