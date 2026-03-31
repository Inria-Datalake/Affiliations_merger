/**
 * RORSearch.jsx
 * Composant de recherche dans le registre ROR.
 * Permet de vérifier et remplacer le nom fusionné proposé
 * par le nom officiel ROR.
 */

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ExternalLink, Check, X, Loader2, Globe, Building2 } from "lucide-react";
import { useROR } from "@/hooks/useROR";
import { cn } from "@/lib/utils";

const TYPE_COLORS = {
  "Education": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  "Research": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  "Government": { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  "Nonprofit": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  "Healthcare": { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  "Company": { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200" },
};

function TypeBadge({ type }) {
  const colors = TYPE_COLORS[type] || { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", colors.bg, colors.text, colors.border)}>
      {type}
    </span>
  );
}

export default function RORSearch({ currentName, onSelect, onClose }) {
  const [query, setQuery] = useState(currentName || "");
  const { search, results, loading, error, clear } = useROR();
  const inputRef = useRef();
  const debounceRef = useRef();

  // Lancer une recherche automatique sur le nom actuel au montage
  useEffect(() => {
    if (currentName && currentName.trim().length >= 3) {
      search(currentName);
    }
    inputRef.current?.focus();
  }, []);

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    if (val.trim().length >= 3) {
      debounceRef.current = setTimeout(() => search(val), 400);
    } else {
      clear();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="mt-3 rounded-xl border-2 border-purple-200 bg-white shadow-lg overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-purple-50/50">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #7209B7, #4CC9F0)" }}>
            <Building2 className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-semibold text-foreground">Vérifier dans ROR</span>
          <span className="text-[10px] text-muted-foreground bg-white border rounded px-1.5 py-0.5">
            100 000+ organismes officiels
          </span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Barre de recherche */}
      <div className="px-4 py-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-500 animate-spin" />}
          <input
            ref={inputRef}
            value={query}
            onChange={handleInput}
            placeholder="Rechercher dans ROR..."
            className="w-full pl-9 pr-9 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
          />
        </div>
        {error && (
          <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
            <X className="w-3 h-3" />Erreur de connexion à ROR
          </p>
        )}
      </div>

      {/* Résultats */}
      <div className="max-h-72 overflow-y-auto">
        {results.length === 0 && !loading && query.trim().length >= 3 && (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">Aucun résultat pour "{query}"</p>
            <p className="text-xs text-muted-foreground mt-1">Essayez un nom plus court ou en anglais</p>
          </div>
        )}

        {results.length === 0 && !loading && query.trim().length < 3 && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-muted-foreground">Tapez au moins 3 caractères pour rechercher</p>
          </div>
        )}

        {results.map((org, i) => (
          <motion.div
            key={org.id}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="group px-4 py-3 border-b last:border-b-0 hover:bg-purple-50/40 transition-colors cursor-pointer"
            onClick={() => onSelect(org)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {/* Nom officiel */}
                <p className="text-sm font-semibold text-foreground truncate">{org.name}</p>

                {/* Pays + types */}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {org.country && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Globe className="w-3 h-3" />
                      {org.country}
                    </span>
                  )}
                  {org.types.map((t) => <TypeBadge key={t} type={t} />)}
                </div>

                {/* Acronymes / alias */}
                {(org.acronyms.length > 0 || org.aliases.length > 0) && (
                  <p className="text-[10px] text-muted-foreground mt-1 truncate">
                    {[...org.acronyms, ...org.aliases].slice(0, 4).join(" · ")}
                  </p>
                )}

                {/* Lien ROR */}
                <a
                  href={org.id}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] text-purple-600 hover:underline flex items-center gap-0.5 mt-1 w-fit"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  Voir dans ROR
                </a>
              </div>

              {/* Bouton sélectionner */}
              <button
                onClick={(e) => { e.stopPropagation(); onSelect(org); }}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "linear-gradient(135deg, #7209B7, #4CC9F0)" }}
              >
                <Check className="w-3 h-3" />
                Utiliser
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Footer info */}
      <div className="px-4 py-2 bg-muted/20 border-t">
        <p className="text-[10px] text-muted-foreground text-center">
          Source : <a href="https://ror.org" target="_blank" rel="noopener noreferrer"
            className="text-purple-600 hover:underline">ror.org</a> — Research Organization Registry
        </p>
      </div>
    </motion.div>
  );
}