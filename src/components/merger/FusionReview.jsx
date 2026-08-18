import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, GitMerge, ChevronDown, ChevronUp, CheckSquare, Square, Pencil, Search, X, RefreshCw, SlidersHorizontal, BookOpen, Building2, Scissors, Plus, Trash2, AlertCircle, ExternalLink, Sparkles, Loader2, FileText, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import RORSearch from "./RORSearch";
import { invokeLLM } from "@/api/llmClient";

const MULTI_SEP = /\s*;\s*|\s*\|\s*|\s{1,3}\/\s{1,3}|\s*,\s*(?=[A-Z])/;

function autoSplit(text) { if (!text) return []; const parts = text.split(MULTI_SEP).map((p) => p.trim()).filter(Boolean); return parts.length > 1 ? parts : [text]; }

// ── Split IA : reconnaît les filiales et sous-organisations ─────────────────
async function aiSplit(text) {
  const result = await invokeLLM({
    prompt: `Tu es un expert en analyse bibliométrique. Voici une chaîne d'affiliations extraite d'une publication scientifique. Ces affiliations peuvent contenir plusieurs organismes concaténés sans séparateur clair.

Ta tâche : identifier chaque organisation DISTINCTE présente dans cette chaîne.

RÈGLES CRITIQUES :
1. Une filiale ou sous-division reste UNE SEULE entité. Exemples :
   - "google deepmind" → "Google DeepMind" (UN, pas deux)
   - "CSAIL MIT" → "CSAIL" + "Massachusetts Institute of Technology" (DEUX, car CSAIL est un labo du MIT mais c'est une affiliation distincte)
   - "Facebook AI Research" → "Facebook AI Research" (UN)
2. Ne sépare que les organisations RÉELLEMENT distinctes.
3. Normalise les noms (capitalisation correcte).
4. Si tu hésites sur une séparation, ne sépare pas (mieux vaut conserver que scinder à tort).
5. Indique si une organisation est une filiale d'une autre avec "parent_of".

Chaîne à analyser :
"${text}"

Retourne la liste des affiliations distinctes trouvées.`,
    response_json_schema: {
      type: "object",
      properties: {
        affiliations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nom normalisé de l'organisation" },
              is_subsidiary: { type: "boolean", description: "true si c'est une filiale/sous-division d'une autre org listée" },
              parent: { type: "string", description: "Nom de l'organisation parente si is_subsidiary=true, sinon vide" },
              confidence: { type: "number", description: "0 à 1, confiance dans la séparation" }
            },
            required: ["name", "is_subsidiary", "parent", "confidence"]
          }
        },
        reasoning: { type: "string", description: "Brève explication des séparations effectuées" }
      },
      required: ["affiliations"]
    }
  });
  return result;
}

// ── Popover "Ajouter au dictionnaire" ─────────────────────────────────────
function AddToDictionaryPopover({ categories, onAdd, onClose, anchorRect }) {
  const [selected, setSelected] = useState(categories[0] || "");
  const style = anchorRect ? { position: "fixed", top: anchorRect.bottom + 6, left: Math.max(8, anchorRect.right - 224), zIndex: 9999, width: 224 } : { position: "fixed", top: 100, right: 16, zIndex: 9999, width: 224 };
  React.useEffect(() => { const handler = (e) => { if (!e.target.closest("[data-dico-popover]")) onClose(); }; const t = setTimeout(() => document.addEventListener("mousedown", handler), 50); return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); }; }, [onClose]);
  return (
    <motion.div data-dico-popover initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} style={style} className="rounded-2xl border bg-card shadow-xl p-3 space-y-2">
      <p className="text-xs font-semibold">Ajouter au dictionnaire</p>
      <div className="space-y-1 max-h-48 overflow-y-auto">{categories.map((cat) => (<button key={cat} onClick={() => setSelected(cat)} className={cn("w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors", selected === cat ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-muted text-foreground")}>{cat}{selected === cat && <Check className="w-3.5 h-3.5" />}</button>))}</div>
      <div className="flex gap-2 pt-1 border-t"><Button size="sm" className="flex-1 h-7 text-xs text-white border-0 rounded-lg" style={{ background: "#2563EB" }} onClick={() => { onAdd(selected); onClose(); }}><Check className="w-3 h-3 mr-1" />Confirmer</Button><Button variant="outline" size="sm" className="h-7 text-xs rounded-lg" onClick={onClose}><X className="w-3 h-3" /></Button></div>
    </motion.div>
  );
}

// ── Panneau de scission avec détection IA ──────────────────────────────────
function SplitVariantPanel({ variant, existingSplits, onSave, onCancel, publicationCount }) {
  const [parts, setParts] = useState(existingSplits && existingSplits.length > 0 ? existingSplits.map((p) => ({ name: p, isSubsidiary: false, parent: "", confidence: 1 })) : autoSplit(variant).map((p) => ({ name: p, isSubsidiary: false, parent: "", confidence: 1 })));
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReasoning, setAiReasoning] = useState("");
  const [aiDone, setAiDone] = useState(false);
  const [aiError, setAiError] = useState(null);

  const updatePart = (i, value) => setParts((prev) => prev.map((p, idx) => idx === i ? { ...p, name: value } : p));
  const removePart = (i) => setParts((prev) => prev.filter((_, idx) => idx !== i));
  const addPart = () => setParts((prev) => [...prev, { name: "", isSubsidiary: false, parent: "", confidence: 1 }]);
  const handleSave = () => { const cleaned = parts.map((p) => p.name.trim()).filter(Boolean); if (cleaned.length >= 2) onSave(cleaned); };
  const canSave = parts.filter((p) => p.name.trim()).length >= 2;

  const handleAISplit = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiDone(false);
    try {
      const result = await aiSplit(variant);
      if (result.affiliations && result.affiliations.length > 0) {
        setParts(result.affiliations.map((a) => ({ name: a.name, isSubsidiary: a.is_subsidiary, parent: a.parent || "", confidence: a.confidence || 1 })));
        setAiReasoning(result.reasoning || "");
        setAiDone(true);
      }
    } catch (err) {
      setAiError("Erreur de l'IA : " + (err.message || "impossible d'analyser"));
    }
    setAiLoading(false);
  };

  const subsidiaryCount = parts.filter((p) => p.isSubsidiary).length;

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <div className="px-4 pb-4 pt-2 border-t-2 border-dashed border-amber-200 bg-amber-50/40 space-y-3 rounded-b-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Scissors className="w-3.5 h-3.5 text-amber-600" /><span className="text-xs font-semibold text-amber-800">Scinder en plusieurs affiliations</span></div>
          {publicationCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
              <FileText className="w-3 h-3" />{publicationCount} publication{publicationCount > 1 ? "s" : ""} concernée{publicationCount > 1 ? "s" : ""}
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">Cette variante contient potentiellement plusieurs affiliations. Utilisez la détection IA pour identifier les entités distinctes et les filiales, ou éditez manuellement.</p>

        {/* Texte original */}
        <div className="px-3 py-2 rounded-xl bg-card border border-amber-200"><p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Texte original</p><p className="text-xs text-foreground line-clamp-2">{variant}</p></div>

        {/* Bouton détection IA */}
        <div className="flex items-center gap-2">
          <Button size="sm" className="flex-1 h-8 text-xs text-white border-0 rounded-lg" style={{ background: "linear-gradient(135deg, #2563EB, #60A5FA)" }} onClick={handleAISplit} disabled={aiLoading}>
            {aiLoading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Analyse IA en cours...</> : <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Détection IA des affiliations</>}
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg" onClick={() => { setParts(autoSplit(variant).map((p) => ({ name: p, isSubsidiary: false, parent: "", confidence: 1 }))); setAiDone(false); setAiReasoning(""); }}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />Reset
          </Button>
        </div>

        {/* Erreur IA */}
        {aiError && <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20 text-xs text-destructive"><AlertCircle className="w-3.5 h-3.5" />{aiError}</div>}

        {/* Raisonnement IA */}
        {aiDone && aiReasoning && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-200">
            <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-[11px] text-blue-700 leading-relaxed">
              <span className="font-semibold">Analyse IA :</span> {aiReasoning}
              {subsidiaryCount > 0 && <span className="block mt-1 font-medium">{subsidiaryCount} filiale{subsidiaryCount > 1 ? "s" : ""} détectée{subsidiaryCount > 1 ? "s" : ""} — conservée{subsidiaryCount > 1 ? "s" : ""} comme entité{subsidiaryCount > 1 ? "s" : ""} unique{subsidiaryCount > 1 ? "s" : ""}.</span>}
            </div>
          </div>
        )}

        {/* Parts éditables */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Affiliations détectées ({parts.length})</p>
            {aiDone && <p className="text-[10px] text-blue-600 font-medium flex items-center gap-1"><Sparkles className="w-2.5 h-2.5" />IA</p>}
          </div>
          {parts.map((part, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2 group">
                <div className="w-5 h-5 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-[10px] font-semibold text-amber-700 shrink-0">{i + 1}</div>
                <Input value={part.name} onChange={(e) => updatePart(i, e.target.value)} placeholder={`Affiliation ${i + 1}`} className={cn("h-8 text-xs flex-1 rounded-lg", part.isSubsidiary && "border-blue-300 bg-blue-50/30")} />
                <button onClick={() => removePart(i)} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 rounded-lg hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
              </div>
              {part.isSubsidiary && part.parent && (
                <div className="flex items-center gap-1 ml-7 text-[10px] text-blue-600">
                  <Info className="w-2.5 h-2.5" />
                  Filiale de <span className="font-semibold">{part.parent}</span> — conservée comme entité distincte
                </div>
              )}
              {part.confidence < 0.8 && aiDone && (
                <div className="flex items-center gap-1 ml-7 text-[10px] text-amber-600">
                  <AlertCircle className="w-2.5 h-2.5" />
                  Confiance faible ({Math.round(part.confidence * 100)}%) — vérifiez cette séparation
                </div>
              )}
            </div>
          ))}
          <button onClick={addPart} className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 font-medium transition-colors"><Plus className="w-3.5 h-3.5" />Ajouter une affiliation</button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="flex-1 h-8 text-xs text-white border-0 rounded-lg" style={{ background: "#f59e0b" }} onClick={handleSave} disabled={!canSave}>
            <Scissors className="w-3.5 h-3.5 mr-1.5" />Scinder en {parts.filter((p) => p.name.trim()).length} affiliations
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg" onClick={onCancel}>Annuler</Button>
        </div>
        {!canSave && <p className="text-[10px] text-muted-foreground text-center">Définissez au moins 2 affiliations pour scinder</p>}
      </div>
    </motion.div>
  );
}

// ── Carte de groupe ────────────────────────────────────────────────────────
function GroupCard({ group, index, groupSelected, onToggleGroup, variantSelected, onToggleVariant, mergedName, onRename, rorId, onRorSelect, dictionaryCategories, onAddToDictionary, variantSplits, onSplitVariant, onUnsplitVariant, publicationCounts }) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(mergedName);
  const [showDicoPopover, setShowDicoPopover] = useState(false);
  const [dicoAnchorRect, setDicoAnchorRect] = useState(null);
  const [showROR, setShowROR] = useState(false);
  const [splittingVariantIdx, setSplittingVariantIdx] = useState(null);
  const activeCount = variantSelected.filter(Boolean).length;
  const totalVariants = group.variants.length;
  const isPartial = groupSelected && activeCount > 0 && activeCount < totalVariants;
  const isFromDictionary = group.fromDictionary === true;
  const confidenceColor = group.confidence >= 0.8 ? "#16A34A" : group.confidence >= 0.5 ? "#f59e0b" : "#ef4444";
  const handleRORSelect = (org) => { setNameValue(org.name); onRename(index, org.name); onRorSelect(index, org.id); setShowROR(false); };
  const handleVariantToggle = (vi) => { onToggleVariant(index, vi); if (splittingVariantIdx === vi) setSplittingVariantIdx(null); };
  const handleSplitSave = (vi, parts) => { onSplitVariant(group.variants[vi], parts); setSplittingVariantIdx(null); };
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.02 }}>
      <Card className={cn("overflow-hidden transition-all duration-200 border rounded-2xl", !groupSelected ? "border-border bg-muted/20 opacity-50" : isFromDictionary ? "border-emerald-200 bg-emerald-50/30 shadow-sm" : isPartial ? "border-amber-200 bg-amber-50/30 shadow-sm" : "border-blue-200 bg-card shadow-sm")}>
        <div className="flex items-center gap-3 p-4">
          <button onClick={() => onToggleGroup(index)} className="shrink-0 transition-transform hover:scale-110">{groupSelected ? <CheckSquare className="w-5 h-5" style={{ color: isFromDictionary ? "#059669" : "#2563EB" }} /> : <Square className="w-5 h-5 text-muted-foreground" />}</button>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: !groupSelected ? "hsl(var(--muted))" : isFromDictionary ? "#059669" : "#2563EB" }}>{isFromDictionary ? <BookOpen className="w-4 h-4 text-white" /> : <GitMerge className={cn("w-4 h-4", groupSelected ? "text-white" : "text-muted-foreground")} />}</div>
          <div className="flex-1 min-w-0">
            {editing ? (<Input value={nameValue} onChange={(e) => setNameValue(e.target.value)} onBlur={() => { setEditing(false); onRename(index, nameValue); }} onKeyDown={(e) => { if (e.key === "Enter") { setEditing(false); onRename(index, nameValue); } }} autoFocus className="h-7 text-sm font-semibold rounded-lg" />) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("text-sm font-semibold truncate", !groupSelected && "text-muted-foreground")}>{nameValue}</span>
                {isFromDictionary && <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-200 font-normal">dictionnaire</span>}
                {rorId && <a href={rorId} target="_blank" rel="noopener noreferrer" className="text-[10px] px-1.5 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 font-normal flex items-center gap-0.5 hover:bg-blue-100 transition-colors" onClick={(e) => e.stopPropagation()}><ExternalLink className="w-2.5 h-2.5" />ROR</a>}
                {groupSelected && <button onClick={() => setEditing(true)} className="p-1 rounded-lg hover:bg-muted transition-colors shrink-0"><Pencil className="w-3 h-3 text-muted-foreground" /></button>}
              </div>
            )}
            <div className="flex items-center gap-2 mt-0.5"><span className="text-xs text-muted-foreground">{isPartial ? <span className="text-amber-600 font-medium">{activeCount}/{totalVariants} variantes</span> : `${totalVariants} variante${totalVariants > 1 ? "s" : ""}`}</span><span className="text-xs font-medium" style={{ color: confidenceColor }}>{group.confidence === 1 && isFromDictionary ? "Dictionnaire" : `${Math.round(group.confidence * 100)}% confiance`}</span></div>
          </div>
          {groupSelected && (<div className="flex items-center gap-1 shrink-0"><button onClick={() => { setShowROR((s) => !s); setShowDicoPopover(false); }} className={cn("p-1.5 rounded-lg border transition-colors", showROR ? "bg-blue-50 border-blue-200" : "hover:bg-muted border-transparent")} title="Vérifier dans ROR"><Building2 className={cn("w-3.5 h-3.5", showROR ? "text-blue-700" : "text-muted-foreground")} /></button>{!isFromDictionary && dictionaryCategories && dictionaryCategories.length > 0 && (<div className="relative"><button onClick={(e) => { setDicoAnchorRect(e.currentTarget.getBoundingClientRect()); setShowDicoPopover((s) => !s); setShowROR(false); }} className={cn("p-1.5 rounded-lg border transition-colors", showDicoPopover ? "bg-green-50 border-green-200" : "hover:bg-muted border-transparent")} title="Ajouter au dictionnaire"><BookOpen className={cn("w-3.5 h-3.5", showDicoPopover ? "text-green-600" : "text-muted-foreground")} /></button><AnimatePresence>{showDicoPopover && (<AddToDictionaryPopover categories={dictionaryCategories} anchorRect={dicoAnchorRect} onAdd={(cat) => { onAddToDictionary(index, cat, nameValue); setShowDicoPopover(false); }} onClose={() => setShowDicoPopover(false)} />)}</AnimatePresence></div>)}</div>)}
          <button onClick={() => setExpanded((e) => !e)} className="p-1 rounded-lg hover:bg-muted transition-colors shrink-0">{expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}</button>
        </div>
        <AnimatePresence>{showROR && groupSelected && (<div className="px-4 pb-4"><RORSearch currentName={nameValue} onSelect={handleRORSelect} onClose={() => setShowROR(false)} /></div>)}</AnimatePresence>
        <AnimatePresence>{expanded && (<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><div className="px-4 pb-4 space-y-1.5 border-t pt-3">{group.variants.map((variant, vi) => { const isSelected = variantSelected[vi]; const isSplit = variantSplits ? variantSplits[variant] : null; const isSplitting = splittingVariantIdx === vi; const pubCount = publicationCounts ? (publicationCounts[variant] || 0) : 0; return (<div key={vi}><div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs transition-colors group", isSelected ? "bg-card border" : "bg-muted/30 border border-transparent", isSplit && "ring-1 ring-amber-300")}><button onClick={() => handleVariantToggle(vi)} className="shrink-0">{isSelected ? <CheckSquare className="w-4 h-4" style={{ color: isFromDictionary ? "#059669" : "#2563EB" }} /> : <Square className="w-4 h-4 text-muted-foreground" />}</button><span className={cn("flex-1 truncate", isSelected ? "text-foreground" : "text-muted-foreground line-through", isSplit && "text-amber-700 font-medium")}>{variant}</span>{pubCount > 0 && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0"><FileText className="w-2.5 h-2.5" />{pubCount} pub{pubCount > 1 ? "" : ""}</span>}{isSplit && !isSelected && <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 shrink-0"><Scissors className="w-2.5 h-2.5" />{isSplit.length} affiliations</span>}{!isSelected && !isSplit && <button onClick={() => setSplittingVariantIdx(isSplitting ? null : vi)} className={cn("text-[10px] px-2 py-0.5 rounded-full border transition-all shrink-0", isSplitting ? "bg-amber-100 border-amber-300 text-amber-700" : "opacity-0 group-hover:opacity-100 border-amber-200 text-amber-600 hover:bg-amber-50")}><Scissors className="w-2.5 h-2.5 inline mr-0.5" />Scinder</button>}{isSplit && !isSelected && <button onClick={() => onUnsplitVariant(variant)} className="text-[10px] px-2 py-0.5 rounded-full border border-muted-foreground/20 text-muted-foreground hover:bg-muted transition-all shrink-0">Annuler scission</button>}</div><AnimatePresence>{isSplitting && !isSelected && (<SplitVariantPanel variant={variant} existingSplits={isSplit} publicationCount={pubCount} onSave={(parts) => handleSplitSave(vi, parts)} onCancel={() => setSplittingVariantIdx(null)} />)}</AnimatePresence></div>);})}</div></motion.div>)}</AnimatePresence>
      </Card>
    </motion.div>
  );
}

// ── Composant principal ──────────────────────────────────────────────────
export default function FusionReview({ groups: initialGroups, onComplete, onReanalyze, initialMinConfidence = 50, dictionaryProps, rawData, selectedColumn }) {
  const [search, setSearch] = useState("");
  const [showConfidencePanel, setShowConfidencePanel] = useState(false);
  const [minConfidence, setMinConfidence] = useState(initialMinConfidence);
  const [groupSelected, setGroupSelected] = useState(() => new Array(initialGroups.length).fill(true));
  const [variantSelected, setVariantSelected] = useState(() => initialGroups.map((g) => new Array(g.variants.length).fill(true)));
  const [mergedNames, setMergedNames] = useState(() => initialGroups.map((g) => g.merged_name));
  const [mergedRorIds, setMergedRorIds] = useState(() => new Array(initialGroups.length).fill(null));
  const [variantSplits, setVariantSplits] = useState({});

  // ── Comptage des publications par variante ──────────────────────────────
  const publicationCounts = useMemo(() => {
    if (!rawData || !selectedColumn) return {};
    const counts = {};
    for (const row of rawData) {
      const val = String(row[selectedColumn] || "").trim();
      if (val) { counts[val] = (counts[val] || 0) + 1; }
    }
    return counts;
  }, [rawData, selectedColumn]);

  const handleSplitVariant = (variant, parts) => setVariantSplits((prev) => ({ ...prev, [variant]: parts }));
  const handleUnsplitVariant = (variant) => setVariantSplits((prev) => { const next = { ...prev }; delete next[variant]; return next; });
  const filteredOriginalIndices = useMemo(() => initialGroups.reduce((acc, g, i) => { if (Math.round(g.confidence * 100) >= minConfidence) acc.push(i); return acc; }, []), [initialGroups, minConfidence]);
  const filteredIndices = useMemo(() => { if (!search.trim()) return filteredOriginalIndices; const q = search.toLowerCase(); return filteredOriginalIndices.filter((oi) => { const g = initialGroups[oi]; return g.merged_name.toLowerCase().includes(q) || g.variants.some((v) => v.toLowerCase().includes(q)); }); }, [search, filteredOriginalIndices, initialGroups]);
  const validCount = filteredOriginalIndices.filter((oi) => groupSelected[oi] && variantSelected[oi].filter(Boolean).length >= 2).length;
  const splitCount = Object.keys(variantSplits).length;
  const rorCount = mergedRorIds.filter(Boolean).length;
  const dicoGroups = initialGroups.filter((g) => g.fromDictionary).length;
  const iaGroups = initialGroups.filter((g) => !g.fromDictionary).length;
  const handleToggleGroup = (oi) => setGroupSelected((p) => { const n = [...p]; n[oi] = !n[oi]; return n; });
  const handleToggleVariant = (oi, vi) => setVariantSelected((p) => { const n = p.map((a) => [...a]); n[oi][vi] = !n[oi][vi]; return n; });
  const handleRename = (oi, name) => setMergedNames((p) => { const n = [...p]; n[oi] = name; return n; });
  const handleRorSelect = (oi, rorId) => setMergedRorIds((p) => { const n = [...p]; n[oi] = rorId; return n; });
  const handleSelectAll = () => { setGroupSelected((p) => { const n = [...p]; filteredOriginalIndices.forEach((oi) => { n[oi] = true; }); return n; }); setVariantSelected((p) => { const n = p.map((a) => [...a]); filteredOriginalIndices.forEach((oi) => { n[oi] = new Array(initialGroups[oi].variants.length).fill(true); }); return n; }); };
  const handleDeselectAll = () => setGroupSelected((p) => { const n = [...p]; filteredOriginalIndices.forEach((oi) => { n[oi] = false; }); return n; });
  const handleAddToDictionary = (oi, category, canonicalName) => { if (!dictionaryProps || !dictionaryProps.addEntries) return; const variants = initialGroups[oi].variants.filter((_, vi) => variantSelected[oi][vi]); dictionaryProps.addEntries(category, variants, canonicalName); };
  const handleConfirm = () => { const approved = filteredOriginalIndices.map((oi) => ({ ...initialGroups[oi], merged_name: mergedNames[oi], ror_id: mergedRorIds[oi] || null, variants: initialGroups[oi].variants.filter((_, vi) => variantSelected[oi][vi]), category: initialGroups[oi].category || "Affiliations" })).filter((g, idx) => groupSelected[filteredOriginalIndices[idx]] && g.variants.length >= 2); if (dictionaryProps && dictionaryProps.addEntries) { approved.forEach((g) => { dictionaryProps.addEntries(g.category, g.variants, g.merged_name); }); } onComplete(approved, variantSplits); };
  const confidenceDistribution = useMemo(() => ({ high: initialGroups.filter((g) => g.confidence >= 0.8).length, med: initialGroups.filter((g) => g.confidence >= 0.5 && g.confidence < 0.8).length, low: initialGroups.filter((g) => g.confidence < 0.5).length }), [initialGroups]);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-4">
      <Card className="p-4 bg-card border shadow-sm rounded-2xl space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div><h3 className="text-sm font-semibold">{filteredOriginalIndices.length} / {initialGroups.length} groupes affichés</h3>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap"><p className="text-xs text-muted-foreground"><span style={{ color: "#2563EB" }} className="font-medium">{validCount}</span> fusion{validCount > 1 ? "s" : ""} prête{validCount > 1 ? "s" : ""}</p>{rorCount > 0 && <span className="text-xs text-blue-700 font-medium flex items-center gap-1"><Building2 className="w-3 h-3" />{rorCount} ROR</span>}{splitCount > 0 && <span className="text-xs text-amber-600 font-medium flex items-center gap-1"><Scissors className="w-3 h-3" />{splitCount} scindée{splitCount > 1 ? "s" : ""}</span>}{dicoGroups > 0 && <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><BookOpen className="w-3 h-3" />{dicoGroups} dico</span>}{iaGroups > 0 && <span className="text-xs text-muted-foreground font-medium">{iaGroups} IA</span>}</div></div>
          <div className="flex items-center gap-2 flex-wrap"><Button variant="outline" size="sm" onClick={handleSelectAll} className="text-xs h-8 rounded-lg"><CheckSquare className="w-3.5 h-3.5 mr-1.5" />Tout</Button><Button variant="outline" size="sm" onClick={handleDeselectAll} className="text-xs h-8 rounded-lg"><Square className="w-3.5 h-3.5 mr-1.5" />Aucun</Button><Button variant="outline" size="sm" onClick={() => setShowConfidencePanel((p) => !p)} className={cn("text-xs h-8 rounded-lg", showConfidencePanel && "border-blue-300 bg-blue-50")}><SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />Confiance</Button>{onReanalyze && <Button variant="outline" size="sm" onClick={onReanalyze} className="text-xs h-8 rounded-lg"><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Ré-analyser</Button>}</div>
        </div>
        {splitCount === 0 && rorCount === 0 && (<div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-muted/40 border"><AlertCircle className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" /><p className="text-[11px] text-muted-foreground leading-relaxed"><span className="font-medium text-foreground">Astuce :</span> cliquez sur l'icône bâtiment pour vérifier dans ROR. Désélectionnez une variante puis <span className="inline-flex items-center gap-0.5 mx-1 px-1.5 py-0.5 rounded-full border border-amber-200 text-amber-600 text-[10px]"><Scissors className="w-2.5 h-2.5" />Scinder</span> pour la séparer. La détection IA reconnaît les filiales (ex: Google DeepMind = 1 entité).</p></div>)}
        <AnimatePresence>{showConfidencePanel && (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"><div className="pt-2 space-y-3 border-t"><div className="flex items-center justify-between"><p className="text-xs font-medium">Seuil minimum : <span style={{ color: "#2563EB" }} className="font-bold">{minConfidence}%</span></p><p className="text-xs text-muted-foreground">{filteredOriginalIndices.length} groupes</p></div><input type="range" min={0} max={99} step={5} value={minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))} className="w-full accent-blue-600 cursor-pointer" /><div className="flex justify-between text-[10px] text-muted-foreground"><span>0%</span><span>50%</span><span>80%</span></div><div className="grid grid-cols-3 gap-2">{[{ label: "≥ 80%", count: confidenceDistribution.high, color: "#16A34A" }, { label: "50–79%", count: confidenceDistribution.med, color: "#f59e0b" }, { label: "< 50%", count: confidenceDistribution.low, color: "#ef4444" }].map(({ label, count, color }) => (<div key={label} className="text-center p-2 rounded-xl bg-muted/40"><p className="text-sm font-bold" style={{ color }}>{count}</p><p className="text-[10px] text-muted-foreground">{label}</p></div>))}</div></div></motion.div>)}</AnimatePresence>
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Rechercher un groupe ou une variante..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm rounded-xl" /></div>
      </Card>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">{filteredIndices.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Aucun résultat.</p> : filteredIndices.map((oi) => (<GroupCard key={oi} index={oi} group={initialGroups[oi]} groupSelected={groupSelected[oi]} onToggleGroup={handleToggleGroup} variantSelected={variantSelected[oi]} onToggleVariant={handleToggleVariant} mergedName={mergedNames[oi]} onRename={handleRename} rorId={mergedRorIds[oi]} onRorSelect={handleRorSelect} dictionaryCategories={dictionaryProps ? dictionaryProps.getCategories() : []} onAddToDictionary={handleAddToDictionary} variantSplits={variantSplits} onSplitVariant={handleSplitVariant} onUnsplitVariant={handleUnsplitVariant} publicationCounts={publicationCounts} />))}</div>
      <div className="sticky bottom-0 pt-2 pb-1"><Button className="w-full text-white border-0 h-11 rounded-xl shadow-sm" style={{ background: "#2563EB" }} onClick={handleConfirm} disabled={validCount === 0}><Check className="w-4 h-4 mr-2" />Valider {validCount} fusion{validCount > 1 ? "s" : ""}{rorCount > 0 ? ` · ${rorCount} ROR` : ""}{splitCount > 0 ? ` · ${splitCount} scission${splitCount > 1 ? "s" : ""}` : ""}</Button>{validCount === 0 && <p className="text-center text-xs text-muted-foreground mt-2">Chaque fusion doit contenir au moins 2 variantes actives</p>}</div>
    </motion.div>
  );
}
