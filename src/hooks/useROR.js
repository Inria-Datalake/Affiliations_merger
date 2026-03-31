/**
 * useROR.js
 * Hook pour interroger l'API ROR (Research Organization Registry)
 * API publique, gratuite, sans clé API.
 * Doc : https://ror.readme.io/docs/rest-api
 */

import { useState, useCallback } from "react";

const ROR_API = "https://api.ror.org/organizations";

/**
 * Recherche un organisme dans ROR
 * Retourne les 5 meilleurs résultats
 */
export async function searchROR(query) {
  if (!query || query.trim().length < 3) return [];
  try {
    const url = `${ROR_API}?query=${encodeURIComponent(query.trim())}&page=1`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`ROR API error: ${response.status}`);
    const data = await response.json();
    return (data.items || []).slice(0, 5).map((item) => ({
      id: item.id,
      name: item.name,
      country: item.country?.country_name || "",
      countryCode: item.country?.country_code || "",
      types: item.types || [],
      aliases: item.aliases || [],
      acronyms: item.acronyms || [],
      links: item.links || [],
      score: item.score,
    }));
  } catch (err) {
    console.warn("Erreur ROR :", err);
    return [];
  }
}

/**
 * Hook React pour la recherche ROR avec état de chargement
 */
export function useROR() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const search = useCallback(async (query) => {
    if (!query || query.trim().length < 3) {
      setResults([]);
      return [];
    }
    setLoading(true);
    setError(null);
    try {
      const items = await searchROR(query);
      setResults(items);
      return items;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return { search, results, loading, error, clear };
}