import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, Plus, Download, Upload, Trash2,
  ChevronDown, ChevronUp, X, Check, FolderPlus
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function DictionaryManager({ dictionary, getCategories, getEntries, addCategory, addEntries, removeEntry, exportDictionary, importDictionary, totalEntries }) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const fileInputRef = useRef();

  const categories = getCategories();

  const handleAddCategory = () => {
    if (addCategory(newCategoryName)) {
      setActiveCategory(newCategoryName.trim());
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
                : `${totalEntries} entrée${totalEntries > 1 ? "s" : ""} dans ${categories.length} catégorie${categories.length > 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalEntries > 0 && (
            <Badge style={{ background: "linear-gradient(135deg, #7209B7, #4CC9F0)", color: "white", border: "none" }}>
              {totalEntries}
            </Badge>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Panneau dépliable */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Card className="mt-2 p-4 space-y-4 bg-white/80">

              {/* Actions globales */}
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={exportDictionary} disabled={totalEntries === 0}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />Exporter JSON
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5 mr-1.5" />Importer JSON
                </Button>
                <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setShowNewCategory(true)}>
                  <FolderPlus className="w-3.5 h-3.5 mr-1.5" />Nouvelle catégorie
                </Button>
              </div>

              {/* Feedback import */}
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

              {/* Nouvelle catégorie */}
              <AnimatePresence>
                {showNewCategory && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex gap-2">
                    <Input
                      placeholder="Nom de la catégorie (ex: Universités)"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                      className="h-8 text-sm flex-1"
                      autoFocus
                    />
                    <Button size="sm" className="h-8 text-xs text-white border-0"
                      style={{ background: "linear-gradient(135deg, #7209B7, #4CC9F0)" }}
                      onClick={handleAddCategory} disabled={!newCategoryName.trim()}>
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => setShowNewCategory(false)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Onglets catégories */}
              <div className="flex gap-1.5 flex-wrap">
                {categories.map((cat) => {
                  const count = Object.keys(getEntries(cat)).length;
                  return (
                    <button key={cat}
                      onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                        activeCategory === cat
                          ? "text-white border-transparent"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                      )}
                      style={activeCategory === cat ? { background: "linear-gradient(135deg, #7209B7, #F72585)" } : {}}
                    >
                      {cat} {count > 0 && <span className="ml-1 opacity-75">({count})</span>}
                    </button>
                  );
                })}
              </div>

              {/* Contenu catégorie active */}
              <AnimatePresence>
                {activeCategory && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <CategoryEntries
                      category={activeCategory}
                      entries={getEntries(activeCategory)}
                      onAdd={(variants, canonical) => addEntries(activeCategory, variants, canonical)}
                      onRemove={(variant) => removeEntry(activeCategory, variant)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {totalEntries === 0 && !activeCategory && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Sélectionnez une catégorie pour ajouter des entrées, ou importez un dictionnaire existant.
                </p>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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
    <div className="space-y-3 border-t pt-3">
      <p className="text-xs font-medium text-foreground">
        Entrées dans <span style={{ color: "#7209B7" }}>{category}</span>
        {entryList.length > 0 && <span className="text-muted-foreground ml-1">({entryList.length})</span>}
      </p>

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

      {/* Liste des entrées */}
      {entryList.length > 0 ? (
        <div className="max-h-48 overflow-y-auto space-y-1">
          {entryList.map(([variant, canonical]) => (
            <div key={variant} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-white border text-xs group">
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
        <p className="text-xs text-muted-foreground text-center py-2">Aucune entrée dans cette catégorie.</p>
      )}
    </div>
  );
}