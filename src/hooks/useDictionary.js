/**
 * useDictionary.js
 * Persistance sur deux niveaux :
 *   1. localStorage  — immédiat, toujours disponible
 *   2. dictionary.json via serveur Express — fichier réel sur disque
 *
 * Si le serveur n'est pas lancé, l'app fonctionne quand même avec localStorage.
 */

import { useState, useCallback, useEffect, useRef } from "react";

const STORAGE_KEY = "affiliation_merger_dictionary";
const SERVER_URL = "http://localhost:3001/api/dictionary";
const PREDEFINED_CATEGORIES = ["Affiliations", "Pays", "Laboratoires", "Établissements"];

const DEFAULT_DICTIONARY = {
  categories: Object.fromEntries(PREDEFINED_CATEGORIES.map((c) => [c, {}])),
  meta: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: "1.0",
  },
};

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const categories = { ...parsed.categories };
    for (const cat of PREDEFINED_CATEGORIES) {
      if (!categories[cat]) categories[cat] = {};
    }
    return { ...parsed, categories };
  } catch { return null; }
}

function saveToLocalStorage(dict) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(dict)); } catch { }
}

async function loadFromServer() {
  try {
    const res = await fetch(SERVER_URL, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function saveToServer(dict) {
  try {
    await fetch(SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dict),
      signal: AbortSignal.timeout(3000),
    });
  } catch { }
}

export function useDictionary() {
  const [dictionary, setDictionaryState] = useState(() => loadFromLocalStorage() || DEFAULT_DICTIONARY);
  const [serverAvailable, setServerAvailable] = useState(false);
  const saveTimeoutRef = useRef(null);

  // Chargement initial depuis le serveur
  useEffect(() => {
    loadFromServer().then((serverData) => {
      if (serverData && serverData.categories) {
        setServerAvailable(true);
        const serverEntries = Object.values(serverData.categories)
          .reduce((s, c) => s + Object.keys(c).length, 0);
        const localEntries = Object.values(dictionary.categories)
          .reduce((s, c) => s + Object.keys(c).length, 0);
        if (serverEntries >= localEntries) {
          const categories = { ...serverData.categories };
          for (const cat of PREDEFINED_CATEGORIES) {
            if (!categories[cat]) categories[cat] = {};
          }
          const merged = { ...serverData, categories };
          setDictionaryState(merged);
          saveToLocalStorage(merged);
        }
      }
    });
  }, []);

  // Sauvegarde avec debounce
  const persistDictionary = useCallback((dict) => {
    saveToLocalStorage(dict);
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveToServer(dict), 800);
  }, []);

  const setDictionary = useCallback((updater) => {
    setDictionaryState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persistDictionary(next);
      return next;
    });
  }, [persistDictionary]);

  // ── Lecture ───────────────────────────────────────────────────
  const getCategories = useCallback(() => Object.keys(dictionary.categories), [dictionary]);
  const getEntries = useCallback((cat) => dictionary.categories[cat] || {}, [dictionary]);

  const lookup = useCallback((variant) => {
    const key = variant.trim().toLowerCase();
    for (const [cat, entries] of Object.entries(dictionary.categories)) {
      for (const [v, canonical] of Object.entries(entries)) {
        if (v.trim().toLowerCase() === key) return { canonicalName: canonical, category: cat };
      }
    }
    return null;
  }, [dictionary]);

  // ── Pré-traitement ────────────────────────────────────────────
  const preProcess = useCallback((affiliations) => {
    const normalizeStr = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
    const seen = new Map();
    const exactDuplicates = [];

    for (const aff of affiliations) {
      const norm = normalizeStr(aff);
      if (seen.has(norm)) exactDuplicates.push({ duplicate: aff, canonical: seen.get(norm) });
      else seen.set(norm, aff);
    }

    const deduplicated = [...seen.values()];
    const MULTI_SEP = /\s*;\s*/;
    const multiOrgCandidates = deduplicated
      .filter((aff) => MULTI_SEP.test(aff))
      .map((aff) => ({ original: aff, parts: aff.split(MULTI_SEP).map((p) => p.trim()).filter(Boolean) }));

    const canonicalMap = {};
    const unknown = [];

    for (const aff of deduplicated) {
      const found = lookup(aff);
      if (found) {
        if (!canonicalMap[found.canonicalName])
          canonicalMap[found.canonicalName] = { variants: [], category: found.category, canonicalName: found.canonicalName };
        canonicalMap[found.canonicalName].variants.push(aff);
      } else {
        unknown.push(aff);
      }
    }

    const knownGroups = Object.values(canonicalMap).map((g) => ({
      variants: g.variants, merged_name: g.canonicalName,
      confidence: 1.0, fromDictionary: true, category: g.category,
    }));

    return { knownGroups, unknownAffiliations: unknown, exactDuplicates, multiOrgCandidates };
  }, [lookup]);

  // ── Écriture ──────────────────────────────────────────────────
  const addCategory = useCallback((name) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    setDictionary((prev) => {
      if (prev.categories[trimmed]) return prev;
      return { ...prev, categories: { ...prev.categories, [trimmed]: {} }, meta: { ...prev.meta, updatedAt: new Date().toISOString() } };
    });
    return true;
  }, [setDictionary]);

  const addEntries = useCallback((category, variants, canonicalName) => {
    setDictionary((prev) => {
      const catEntries = { ...(prev.categories[category] || {}) };
      for (const v of variants) catEntries[v.trim()] = canonicalName.trim();
      return { ...prev, categories: { ...prev.categories, [category]: catEntries }, meta: { ...prev.meta, updatedAt: new Date().toISOString() } };
    });
  }, [setDictionary]);

  const removeEntry = useCallback((category, variant) => {
    setDictionary((prev) => {
      const catEntries = { ...(prev.categories[category] || {}) };
      delete catEntries[variant];
      return { ...prev, categories: { ...prev.categories, [category]: catEntries }, meta: { ...prev.meta, updatedAt: new Date().toISOString() } };
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
          if (!data.categories) throw new Error("Format invalide.");
          const categories = { ...data.categories };
          for (const cat of PREDEFINED_CATEGORIES) { if (!categories[cat]) categories[cat] = {}; }
          const merged = { ...DEFAULT_DICTIONARY, ...data, categories, meta: { ...data.meta, updatedAt: new Date().toISOString() } };
          setDictionary(merged);
          resolve(merged);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error("Erreur de lecture."));
      reader.readAsText(file);
    });
  }, [setDictionary]);

  const totalEntries = Object.values(dictionary.categories)
    .reduce((sum, cat) => sum + Object.keys(cat).length, 0);

  return {
    dictionary, getCategories, getEntries, lookup, preProcess,
    addCategory, addEntries, removeEntry, clearDictionary,
    exportDictionary, importDictionary,
    totalEntries, serverAvailable, PREDEFINED_CATEGORIES,
    lastUpdated: dictionary.meta?.updatedAt,
  };
}
