import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Check, GitMerge, ChevronDown, ChevronUp,
  CheckSquare, Square, Pencil, Search, X,
  RefreshCw, SlidersHorizontal, BookOpen, Building2
} from "lucide-react";
import { cn } from "@/lib/utils";
import RORSearch from "./RORSearch";

function AddToDictionaryPopover({ categories, onAdd, onClose, anchorRect }) {
  const [selected, setSelected] = useState(categories[0] || "");

  // Calcul position fixed sous le bouton, aligné à droite
  const style = anchorRect
    ? {
        position: "fixed",
        top: anchorRect.bottom + 6,
        left: Math.max(8, anchorRect.right - 224), // 224 = w-56
        zIndex: 9999,
        width: 224,
      }
    : { position: "fixed", top: 100, right: 16, zIndex: 9999, width: 224 };

  // Fermer au clic extérieur
  React.useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest("[data-dico-popover]")) onClose();
    };
    // léger délai pour ne pas capturer le clic d'ouverture
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  return (
    <motion.div
      data-dico-popover
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={style}
      className="rounded-xl border bg-background shadow-xl p-3 space-y-2"
    >
      <p className="text-xs font-semibold">Ajouter au dictionnaire</p>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {categories.map((cat) => (
          <button key={cat} onClick={() => setSelected(cat)}
            className={cn("w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors",
              selected === cat ? "bg-purple-50 text-purple-700 font-medium" : "hover:bg-muted text-foreground")}>
            {cat}
            {selected === cat && <Check className="w-3.5 h-3.5" />}
          </button>
        ))}
      </div>
      <div className="flex gap-2 pt-1 border-t">
        <Button size="sm" className="flex-1 h-7 text-xs text-white border-0"
          style={{ background: "linear-gradient(135deg, #7209B7, #4CC9F0)" }}
          onClick={() => { onAdd(selected); onClose(); }}>
          <Check className="w-3 h-3 mr-1" />Confirmer
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClose}>
          <X className="w-3 h-3" />
        </Button>
      </div>
    </motion.div>
  );
}

function GroupCard({
  group, index, groupSelected, onToggleGroup,
  variantSelected, onToggleVariant,
  mergedName, onRename,
  dictionaryCategories, onAddToDictionary,
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(mergedName);
  const [showDicoPopover, setShowDicoPopover] = useState(false);
  const [dicoAnchorRect, setDicoAnchorRect] = useState(null);
  const [showROR, setShowROR] = useState(false);

  const activeCount = variantSelected.filter(Boolean).length;
  const totalVariants = group.variants.length;
  const isPartial = groupSelected && activeCount > 0 && activeCount < totalVariants;
  const isFromDictionary = group.fromDictionary === true;
  const confidenceColor = group.confidence >= 0.8 ? "#22c55e" : group.confidence >= 0.5 ? "#f59e0b" : "#ef4444";

  const handleRORSelect = (org) => {
    setNameValue(org.name);
    onRename(index, org.name);
    setShowROR(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.02 }}>
      <Card className={cn(
        "overflow-hidden transition-all duration-200 border-2",
        !groupSelected ? "border-border bg-card/50 opacity-50" :
        isFromDictionary ? "border-emerald-300 bg-emerald-50/20" :
        isPartial ? "border-amber-300 bg-amber-50/20" :
        "border-purple-300 bg-purple-50/30"
      )}>
        {/* Header */}
        <div className="flex items-center gap-3 p-4">
          <button onClick={() => onToggleGroup(index)} className="shrink-0 transition-transform hover:scale-110">
            {groupSelected
              ? <CheckSquare className="w-5 h-5" style={{ color: isFromDictionary ? "#059669" : "#7209B7" }} />
              : <Square className="w-5 h-5 text-muted-foreground" />}
          </button>

          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: !groupSelected ? "hsl(var(--muted))" : isFromDictionary ? "linear-gradient(135deg, #059669, #34d399)" : "linear-gradient(135deg, #7209B7, #F72585)" }}>
            {isFromDictionary
              ? <BookOpen className="w-4 h-4 text-white" />
              : <GitMerge className={cn("w-4 h-4", groupSelected ? "text-white" : "text-muted-foreground")} />}
          </div>

          <div className="flex-1 min-w-0">
            {editing ? (
              <Input value={nameValue} onChange={(e) => setNameValue(e.target.value)}
                onBlur={() => { setEditing(false); onRename(index, nameValue); }}
                onKeyDown={(e) => { if (e.key === "Enter") { setEditing(false); onRename(index, nameValue); } }}
                autoFocus className="h-7 text-sm font-semibold" />
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("text-sm font-semibold truncate", !groupSelected && "text-muted-foreground")}>
                  {nameValue}
                </span>
                {isFromDictionary && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-100 text-emerald-700 border-emerald-200 font-normal">
                    dictionnaire
                  </span>
                )}
                {groupSelected && (
                  <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-muted transition-colors shrink-0">
                    <Pencil className="w-3 h-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">
                {isPartial
                  ? <span className="text-amber-600 font-medium">{activeCount}/{totalVariants} variantes</span>
                  : `${totalVariants} variante${totalVariants > 1 ? "s" : ""}`}
              </span>
              <span className="text-xs font-medium" style={{ color: confidenceColor }}>
                {group.confidence === 1 && isFromDictionary ? "Dictionnaire" : `${Math.round(group.confidence * 100)}% confiance`}
              </span>
            </div>
          </div>

          {/* Actions */}
          {groupSelected && (
            <div className="flex items-center gap-1 shrink-0">
              {/* Bouton ROR */}
              <button
                onClick={() => { setShowROR((s) => !s); setShowDicoPopover(false); }}
                className={cn("p-1.5 rounded-lg border transition-colors",
                  showROR ? "bg-purple-100 border-purple-300" : "hover:bg-muted border-transparent")}
                title="Vérifier dans ROR"
              >
                <Building2 className={cn("w-3.5 h-3.5", showROR ? "text-purple-600" : "text-muted-foreground")} />
              </button>

              {/* Bouton dictionnaire */}
              {!isFromDictionary && dictionaryCategories?.length > 0 && (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      setDicoAnchorRect(e.currentTarget.getBoundingClientRect());
                      setShowDicoPopover((s) => !s);
                      setShowROR(false);
                    }}
                    className={cn("p-1.5 rounded-lg border transition-colors",
                      showDicoPopover ? "bg-green-100 border-green-300" : "hover:bg-muted border-transparent")}
                    title="Ajouter au dictionnaire"
                  >
                    <BookOpen className={cn("w-3.5 h-3.5", showDicoPopover ? "text-green-600" : "text-muted-foreground")} />
                  </button>
                  <AnimatePresence>
                    {showDicoPopover && (
                      <AddToDictionaryPopover
                        categories={dictionaryCategories}
                        anchorRect={dicoAnchorRect}
                        onAdd={(cat) => { onAddToDictionary(index, cat, nameValue); setShowDicoPopover(false); }}
                        onClose={() => setShowDicoPopover(false)}
                      />
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}

          <button onClick={() => setExpanded((e) => !e)} className="p-1 rounded hover:bg-muted transition-colors shrink-0">
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
        </div>

        {/* Panneau ROR */}
        <AnimatePresence>
          {showROR && groupSelected && (
            <div className="px-4 pb-4">
              <RORSearch
                currentName={nameValue}
                onSelect={handleRORSelect}
                onClose={() => setShowROR(false)}
              />
            </div>
          )}
        </AnimatePresence>

        {/* Variantes */}
        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="px-4 pb-4 space-y-1.5 pl-16">
                {!groupSelected && <p className="text-xs text-muted-foreground italic mb-2">Activez le groupe pour gérer les variantes</p>}
                {group.variants.map((v, vi) => (
                  <div key={vi}
                    className={cn("flex items-center gap-2 p-2 rounded-lg transition-colors",
                      groupSelected ? "hover:bg-muted/40 cursor-pointer" : "opacity-40 cursor-not-allowed",
                      groupSelected && variantSelected[vi] ? "bg-white/60" : "")}
                    onClick={() => groupSelected && onToggleVariant(index, vi)}>
                    <div className="shrink-0">
                      {groupSelected && variantSelected[vi]
                        ? <Check className="w-4 h-4" style={{ color: isFromDictionary ? "#059669" : "#7209B7" }} />
                        : <X className="w-4 h-4 text-muted-foreground/50" />}
                    </div>
                    <span className={cn("text-xs",
                      groupSelected && variantSelected[vi] ? "text-foreground font-medium" : "text-muted-foreground line-through")}>
                      {v}
                    </span>
                  </div>
                ))}
                {groupSelected && activeCount < 2 && (
                  <p className="text-xs text-amber-600 mt-2">⚠ Il faut au moins 2 variantes pour créer une fusion.</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

export default function FusionReview({ groups: initialGroups, onComplete, onReanalyze, initialMinConfidence = 0, dictionaryProps }) {
  const [minConfidence, setMinConfidence] = useState(initialMinConfidence);
  const [showConfidencePanel, setShowConfidencePanel] = useState(false);
  const [search, setSearch] = useState("");
  const [groupSelected, setGroupSelected] = useState(() => new Array(initialGroups.length).fill(true));
  const [variantSelected, setVariantSelected] = useState(() =>
    initialGroups.map((g) => new Array(g.variants.length).fill(true))
  );
  const [mergedNames, setMergedNames] = useState(() => initialGroups.map((g) => g.merged_name));

  const filteredOriginalIndices = useMemo(() =>
    initialGroups.reduce((acc, g, i) => {
      if (Math.round(g.confidence * 100) >= minConfidence) acc.push(i);
      return acc;
    }, []),
    [initialGroups, minConfidence]
  );

  const filteredIndices = useMemo(() => {
    if (!search.trim()) return filteredOriginalIndices;
    const q = search.toLowerCase();
    return filteredOriginalIndices.filter((oi) => {
      const g = initialGroups[oi];
      return g.merged_name.toLowerCase().includes(q) || g.variants.some((v) => v.toLowerCase().includes(q));
    });
  }, [search, filteredOriginalIndices, initialGroups]);

  const validCount = filteredOriginalIndices.filter((oi) =>
    groupSelected[oi] && variantSelected[oi].filter(Boolean).length >= 2
  ).length;

  const dicoGroups = initialGroups.filter((g) => g.fromDictionary).length;
  const iaGroups = initialGroups.filter((g) => !g.fromDictionary).length;

  const handleToggleGroup = (oi) => setGroupSelected((p) => { const n = [...p]; n[oi] = !n[oi]; return n; });
  const handleToggleVariant = (oi, vi) => setVariantSelected((p) => { const n = p.map((a) => [...a]); n[oi][vi] = !n[oi][vi]; return n; });
  const handleRename = (oi, name) => setMergedNames((p) => { const n = [...p]; n[oi] = name; return n; });

  const handleSelectAll = () => {
    setGroupSelected((p) => { const n = [...p]; filteredOriginalIndices.forEach((oi) => { n[oi] = true; }); return n; });
    setVariantSelected((p) => { const n = p.map((a) => [...a]); filteredOriginalIndices.forEach((oi) => { n[oi] = new Array(initialGroups[oi].variants.length).fill(true); }); return n; });
  };
  const handleDeselectAll = () => setGroupSelected((p) => { const n = [...p]; filteredOriginalIndices.forEach((oi) => { n[oi] = false; }); return n; });

  const handleAddToDictionary = (oi, category, canonicalName) => {
    if (!dictionaryProps?.addEntries) return;
    const variants = initialGroups[oi].variants.filter((_, vi) => variantSelected[oi][vi]);
    dictionaryProps.addEntries(category, variants, canonicalName);
  };

  const handleConfirm = () => {
    const approved = filteredOriginalIndices
      .map((oi) => ({
        ...initialGroups[oi],
        merged_name: mergedNames[oi],
        variants: initialGroups[oi].variants.filter((_, vi) => variantSelected[oi][vi]),
        category: initialGroups[oi].category || "Affiliations",
      }))
      .filter((g, idx) => groupSelected[filteredOriginalIndices[idx]] && g.variants.length >= 2);

    // ── Ajout automatique au dictionnaire ──────────────────────
    if (dictionaryProps?.addEntries) {
      approved.forEach((g) => {
        dictionaryProps.addEntries(g.category, g.variants, g.merged_name);
      });
    }

    onComplete(approved);
  };

  const confidenceDistribution = useMemo(() => ({
    high: initialGroups.filter((g) => g.confidence >= 0.8).length,
    med: initialGroups.filter((g) => g.confidence >= 0.5 && g.confidence < 0.8).length,
    low: initialGroups.filter((g) => g.confidence < 0.5).length,
  }), [initialGroups]);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-4">

      <Card className="p-4 bg-card/50 backdrop-blur-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">
              {filteredOriginalIndices.length} / {initialGroups.length} groupes affichés
            </h3>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <p className="text-xs text-muted-foreground">
                <span style={{ color: "#7209B7" }} className="font-medium">{validCount}</span> fusion{validCount > 1 ? "s" : ""} prête{validCount > 1 ? "s" : ""}
              </p>
              {dicoGroups > 0 && <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><BookOpen className="w-3 h-3" />{dicoGroups} du dictionnaire</span>}
              {iaGroups > 0 && <span className="text-xs text-purple-600 font-medium">{iaGroups} par IA</span>}
              <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                <Building2 className="w-3 h-3" />Cliquez 🏢 pour vérifier dans ROR
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleSelectAll} className="text-xs h-8">
              <CheckSquare className="w-3.5 h-3.5 mr-1.5" />Tout
            </Button>
            <Button variant="outline" size="sm" onClick={handleDeselectAll} className="text-xs h-8">
              <Square className="w-3.5 h-3.5 mr-1.5" />Aucun
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowConfidencePanel((p) => !p)}
              className={cn("text-xs h-8", showConfidencePanel && "border-purple-300 bg-purple-50")}>
              <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />Confiance
            </Button>
            {onReanalyze && (
              <Button variant="outline" size="sm" onClick={onReanalyze} className="text-xs h-8">
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Ré-analyser
              </Button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showConfidencePanel && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="pt-2 space-y-3 border-t">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Seuil minimum : <span style={{ color: "#7209B7" }} className="font-bold">{minConfidence}%</span></p>
                  <p className="text-xs text-muted-foreground">{filteredOriginalIndices.length} groupes</p>
                </div>
                <input type="range" min={0} max={99} step={5} value={minConfidence}
                  onChange={(e) => setMinConfidence(Number(e.target.value))}
                  className="w-full accent-purple-600 cursor-pointer" />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0%</span><span>50%</span><span>80%</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "≥ 80% (élevé)", count: confidenceDistribution.high, color: "#22c55e" },
                    { label: "50–79% (moyen)", count: confidenceDistribution.med, color: "#f59e0b" },
                    { label: "< 50% (faible)", count: confidenceDistribution.low, color: "#ef4444" },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="text-center p-2 rounded-lg bg-muted/40">
                      <p className="text-sm font-bold" style={{ color }}>{count}</p>
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher un groupe ou une variante..." value={search}
            onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
      </Card>

      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        {filteredIndices.length === 0
          ? <p className="text-center text-sm text-muted-foreground py-8">Aucun résultat.</p>
          : filteredIndices.map((oi) => (
            <GroupCard key={oi} index={oi} group={initialGroups[oi]}
              groupSelected={groupSelected[oi]} onToggleGroup={handleToggleGroup}
              variantSelected={variantSelected[oi]} onToggleVariant={handleToggleVariant}
              mergedName={mergedNames[oi]} onRename={handleRename}
              dictionaryCategories={dictionaryProps?.getCategories?.()}
              onAddToDictionary={handleAddToDictionary}
            />
          ))}
      </div>

      <div className="sticky bottom-0 pt-2 pb-1">
        <Button className="w-full text-white border-0 h-11"
          style={{ background: "linear-gradient(135deg, #7209B7, #F72585)" }}
          onClick={handleConfirm} disabled={validCount === 0}>
          <Check className="w-4 h-4 mr-2" />
          Valider {validCount} fusion{validCount > 1 ? "s" : ""}
        </Button>
        {validCount === 0 && (
          <p className="text-center text-xs text-muted-foreground mt-2">
            Chaque fusion doit contenir au moins 2 variantes actives
          </p>
        )}
      </div>
    </motion.div>
  );
}