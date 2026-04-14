import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BookOpen, Plus, Download, Upload, Trash2,
  ChevronDown, ChevronUp, X, Check, FolderPlus,
  Settings, List, AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Onglet Entrées ────────────────────────────────────────────
function CategoryEntries({ category, entries, onAdd, onRemove }) {
  const [newVariants, setNewVariants] = useState("");
  const [newCanonical, setNewCanonical] = useState("");

  const handleAdd = () => {
    const variants = newVariants.split(";").map((v) => v.trim()).filter(Boolean);
    if (variants.length === 0 || !newCanonical.trim()) return;
    onAdd(variants, newCanonical);
    setNewVariants("");
    setNewCanonical("");
  };

  const entryList = Object.entries(entries);

  return (
    <div className="space-y-3">
      {/* Formulaire d'ajout */}
      <div className="space-y-2 p-3 rounded-lg bg-muted/30 border">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Ajouter des entrées</p>
        <Input
          placeholder="Nom canonique (ex: Université de Lyon)"
          value={newCanonical}
          onChange={(e) => setNewCanonical(e.target.value)}
          className="h-8 text-xs"
        />
        <Input
          placeholder="Variantes séparées par ; (ex: Univ. Lyon ; UCB Lyon 1)"
          value={newVariants}
          onChange={(e) => setNewVariants(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="h-8 text-xs"
        />
        <Button size="sm" className="h-7 text-xs text-white border-0 w-full"
          style={{ background: "linear-gradient(135deg, #7209B7, #4CC9F0)" }}
          onClick={handleAdd} disabled={!newVariants.trim() || !newCanonical.trim()}>
          <Plus className="w-3 h-3 mr-1" />Ajouter
        </Button>
      </div>

      {/* Liste */}
      {entryList.length > 0 ? (
        <div className="max-h-48 overflow-y-auto space-y-1">
          {entryList.map(([variant, canonical]) => (
            <div key={variant}
              className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-white border text-xs group">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-muted-foreground truncate">{variant}</span>
                <span className="text-muted-foreground shrink-0">→</span>
                <span className="font-medium truncate" style={{ color: "#7209B7" }}>{canonical}</span>
              </div>
              <button onClick={() => onRemove(variant)}
                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-3">Aucune entrée dans cette catégorie.</p>
      )}
    </div>
  );
}

// ── Onglet Gérer ─────────────────────────────────────────────
function ManageTab({
  dictionary, totalEntries, categories,
  exportDictionary, importDictionary, clearDictionary,
  serverAvailable, lastUpdated,
  addCategory, fileInputRef, onImportFile,
}) {
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleAddCategory = () => {
    if (addCategory(newCategoryName)) {
      setNewCategoryName("");
      setShowNewCategory(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      await importDictionary(file);
      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 3000);
    } catch (err) {
      setImportError(err.message);
    }
    e.target.value = "";
  };

  const handleClear = () => {
    clearDictionary();
    setShowClearConfirm(false);
  };

  return (
    <div className="space-y-4">

      {/* Statut */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-lg bg-muted/30 border text-center">
          <p className="text-xl font-bold" style={{ color: "#7209B7" }}>{totalEntries}</p>
          <p className="text-[10px] text-muted-foreground">entrée{totalEntries > 1 ? "s" : ""} au total</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 border text-center">
          <p className="text-xl font-bold" style={{ color: "#7209B7" }}>{categories.length}</p>
          <p className="text-[10px] text-muted-foreground">catégorie{categories.length > 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Statut serveur */}
      <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-xs border",
        serverAvailable
          ? "bg-green-50 border-green-200 text-green-700"
          : "bg-amber-50 border-amber-200 text-amber-700")}>
        <div className={cn("w-2 h-2 rounded-full", serverAvailable ? "bg-green-500" : "bg-amber-400")} />
        {serverAvailable
          ? "Sauvegarde sur disque active (dictionary.json)"
          : "Serveur non disponible — sauvegarde en localStorage uniquement"}
      </div>

      {lastUpdated && (
        <p className="text-[10px] text-muted-foreground text-center">
          Dernière mise à jour : {new Date(lastUpdated).toLocaleString("fr-FR")}
        </p>
      )}

      {/* Actions */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</p>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" className="text-xs h-9 w-full" onClick={exportDictionary} disabled={totalEntries === 0}>
            <Download className="w-3.5 h-3.5 mr-1.5" />Exporter JSON
          </Button>
          <Button variant="outline" size="sm" className="text-xs h-9 w-full" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-3.5 h-3.5 mr-1.5" />Importer JSON
          </Button>
        </div>

        <Button variant="outline" size="sm" className="text-xs h-9 w-full" onClick={() => setShowNewCategory(true)}>
          <FolderPlus className="w-3.5 h-3.5 mr-1.5" />Nouvelle catégorie
        </Button>
      </div>

      {/* Nouvelle catégorie */}
      <AnimatePresence>
        {showNewCategory && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex gap-2">
              <Input placeholder="Nom de la catégorie" value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                className="h-8 text-sm flex-1" autoFocus />
              <Button size="sm" className="h-8 text-xs text-white border-0"
                style={{ background: "linear-gradient(135deg, #7209B7, #4CC9F0)" }}
                onClick={handleAddCategory} disabled={!newCategoryName.trim()}>
                <Check className="w-3.5 h-3.5" />
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => setShowNewCategory(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feedbacks import */}
      {importSuccess && (
        <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <Check className="w-3.5 h-3.5" />Dictionnaire importé avec succès
        </div>
      )}
      {importError && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
          <X className="w-3.5 h-3.5" />{importError}
        </div>
      )}

      {/* Zone danger — Vider le dictionnaire */}
      <div className="border-2 border-dashed border-destructive/30 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <p className="text-xs font-semibold text-destructive">Zone de danger</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Supprime toutes les entrées du dictionnaire de façon irréversible.
          Pensez à exporter une sauvegarde avant.
        </p>

        <AnimatePresence mode="wait">
          {!showClearConfirm ? (
            <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Button
                variant="outline"
                size="sm"
                className="w-full h-9 text-xs border-destructive/40 text-destructive hover:bg-destructive/5"
                onClick={() => setShowClearConfirm(true)}
                disabled={totalEntries === 0}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Vider le dictionnaire ({totalEntries} entrée{totalEntries > 1 ? "s" : ""})
              </Button>
            </motion.div>
          ) : (
            <motion.div key="confirm" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }} className="space-y-2">
              <p className="text-xs font-medium text-destructive text-center">
                ⚠️ Êtes-vous sûr ? Cette action est irréversible.
              </p>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 h-8 text-xs bg-destructive hover:bg-destructive/90 text-white border-0"
                  onClick={handleClear}>
                  <Trash2 className="w-3 h-3 mr-1" />Confirmer la suppression
                </Button>
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs"
                  onClick={() => setShowClearConfirm(false)}>
                  Annuler
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────
export default function DictionaryManager({
  dictionary, getCategories, getEntries,
  addCategory, addEntries, removeEntry,
  exportDictionary, importDictionary, clearDictionary,
  totalEntries, serverAvailable, lastUpdated,
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("entries"); // "entries" | "manage"
  const [activeCategory, setActiveCategory] = useState(null);
  const fileInputRef = useRef();

  const categories = getCategories();

  // Sélectionner automatiquement la première catégorie
  React.useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0]);
    }
  }, [categories]);

  return (
    <div className="mb-6">
      {/* Bouton d'ouverture */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl border bg-white/70 hover:bg-white transition-colors shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgba(114,9,183,0.12), rgba(76,201,240,0.12))" }}>
            <BookOpen className="w-4 h-4" style={{ color: "#7209B7" }} />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-foreground">Dictionnaire d'affiliations</p>
            <p className="text-xs text-muted-foreground">
              {totalEntries === 0
                ? "Aucune entrée — créez ou importez un dictionnaire"
                : `${totalEntries} entrée${totalEntries > 1 ? "s" : ""} · ${categories.length} catégorie${categories.length > 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalEntries > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #7209B7, #4CC9F0)" }}>
              {totalEntries}
            </span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Panneau */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Card className="mt-2 bg-white/80 overflow-hidden">

              {/* Onglets */}
              <div className="flex border-b">
                {[
                  { id: "entries", label: "Entrées", icon: <List className="w-3.5 h-3.5" /> },
                  { id: "manage", label: "Gérer", icon: <Settings className="w-3.5 h-3.5" /> },
                ].map((tab) => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium transition-colors border-b-2",
                      activeTab === tab.id
                        ? "border-purple-500 text-purple-700 bg-purple-50/50"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/20"
                    )}>
                    {tab.icon}{tab.label}
                  </button>
                ))}
              </div>

              <div className="p-4">
                {/* ── Onglet Entrées ── */}
                {activeTab === "entries" && (
                  <div className="space-y-3">
                    {/* Sélecteur de catégorie */}
                    <div className="flex gap-1.5 flex-wrap">
                      {categories.map((cat) => {
                        const count = Object.keys(getEntries(cat)).length;
                        return (
                          <button key={cat} onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                              activeCategory === cat
                                ? "text-white border-transparent"
                                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                            )}
                            style={activeCategory === cat ? { background: "linear-gradient(135deg, #7209B7, #F72585)" } : {}}>
                            {cat} {count > 0 && <span className="ml-1 opacity-75">({count})</span>}
                          </button>
                        );
                      })}
                    </div>

                    {activeCategory ? (
                      <CategoryEntries
                        category={activeCategory}
                        entries={getEntries(activeCategory)}
                        onAdd={(variants, canonical) => addEntries(activeCategory, variants, canonical)}
                        onRemove={(variant) => removeEntry(activeCategory, variant)}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Sélectionnez une catégorie pour voir ses entrées.
                      </p>
                    )}
                  </div>
                )}

                {/* ── Onglet Gérer ── */}
                {activeTab === "manage" && (
                  <ManageTab
                    dictionary={dictionary}
                    totalEntries={totalEntries}
                    categories={categories}
                    exportDictionary={exportDictionary}
                    importDictionary={importDictionary}
                    clearDictionary={clearDictionary}
                    serverAvailable={serverAvailable}
                    lastUpdated={lastUpdated}
                    addCategory={addCategory}
                    fileInputRef={fileInputRef}
                  />
                )}
              </div>

              {/* Input fichier caché */}
              <input ref={fileInputRef} type="file" accept=".json" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try { await importDictionary(file); } catch {}
                  e.target.value = "";
                }} />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}