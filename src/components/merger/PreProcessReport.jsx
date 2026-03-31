/**
 * PreProcessReport.jsx
 * Affiche un rapport des opérations effectuées AVANT l'appel à l'IA :
 * - Doublons exacts supprimés
 * - Affiliations multi-organismes détectées
 * - Entrées trouvées dans le dictionnaire
 *
 * Propose aussi de scinder les affiliations multi-organismes.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Copy, Scissors, ChevronDown, ChevronUp,
  BookOpen, AlertTriangle, Info
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function PreProcessReport({
  exactDuplicates = [],
  multiOrgCandidates = [],
  knownFromDictionary = 0,
  totalBefore = 0,
  totalAfterDedup = 0,
  onSplitMultiOrg,   // callback(splitAffiliations[]) — optionnel
  onSkip,            // callback — continuer sans scinder
}) {
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showMultiOrg, setShowMultiOrg] = useState(false);
  const [selectedSplits, setSelectedSplits] = useState(() =>
    new Set(multiOrgCandidates.map((_, i) => i))
  );

  const hasAnything = exactDuplicates.length > 0 || multiOrgCandidates.length > 0 || knownFromDictionary > 0;

  const toggleSplit = (i) => {
    setSelectedSplits((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const handleSplit = () => {
    if (!onSplitMultiOrg) return;
    // Construire la liste finale : remplacer les multi-org sélectionnés par leurs parties
    const splitMap = new Map(
      [...selectedSplits].map((i) => [multiOrgCandidates[i].original, multiOrgCandidates[i].parts])
    );
    onSplitMultiOrg(splitMap);
  };

  if (!hasAnything) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="mb-4 space-y-3">

      {/* Titre */}
      <div className="flex items-center gap-2 px-1">
        <Info className="w-4 h-4" style={{ color: "#4361EE" }} />
        <p className="text-sm font-semibold text-foreground">Pré-traitement automatique</p>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            icon: <Copy className="w-4 h-4" />,
            label: "Doublons exacts supprimés",
            value: exactDuplicates.length,
            color: exactDuplicates.length > 0 ? "#F72585" : "#94a3b8",
            active: exactDuplicates.length > 0,
          },
          {
            icon: <Scissors className="w-4 h-4" />,
            label: "Multi-organismes détectés",
            value: multiOrgCandidates.length,
            color: multiOrgCandidates.length > 0 ? "#f59e0b" : "#94a3b8",
            active: multiOrgCandidates.length > 0,
          },
          {
            icon: <BookOpen className="w-4 h-4" />,
            label: "Connus du dictionnaire",
            value: knownFromDictionary,
            color: knownFromDictionary > 0 ? "#059669" : "#94a3b8",
            active: knownFromDictionary > 0,
          },
        ].map(({ icon, label, value, color, active }) => (
          <div key={label}
            className={cn("text-center p-3 rounded-xl border transition-colors",
              active ? "bg-white shadow-sm" : "bg-muted/30 border-transparent")}>
            <div className="flex justify-center mb-1" style={{ color }}>{icon}</div>
            <p className="text-xl font-bold" style={{ color }}>{value}</p>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Doublons exacts */}
      {exactDuplicates.length > 0 && (
        <Card className="overflow-hidden bg-white/70">
          <button
            onClick={() => setShowDuplicates((s) => !s)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
            <div className="flex items-center gap-2">
              <Copy className="w-4 h-4" style={{ color: "#F72585" }} />
              <span className="text-xs font-medium">
                {exactDuplicates.length} doublon{exactDuplicates.length > 1 ? "s" : ""} exact{exactDuplicates.length > 1 ? "s" : ""} supprimé{exactDuplicates.length > 1 ? "s" : ""}
              </span>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">gratuit, sans IA</Badge>
            </div>
            {showDuplicates ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
          <AnimatePresence>
            {showDuplicates && (
              <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                <div className="px-4 pb-3 max-h-40 overflow-y-auto space-y-1.5 border-t pt-3">
                  {exactDuplicates.slice(0, 50).map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground line-through truncate flex-1">{d.duplicate}</span>
                      <span className="text-muted-foreground shrink-0">→</span>
                      <span className="font-medium truncate flex-1" style={{ color: "#F72585" }}>{d.canonical}</span>
                    </div>
                  ))}
                  {exactDuplicates.length > 50 && (
                    <p className="text-[10px] text-muted-foreground text-center pt-1">
                      ... et {exactDuplicates.length - 50} autres
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      )}

      {/* Multi-organismes */}
      {multiOrgCandidates.length > 0 && (
        <Card className="overflow-hidden bg-white/70 border-amber-200">
          <button
            onClick={() => setShowMultiOrg((s) => !s)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-50/30 transition-colors">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-medium">
                {multiOrgCandidates.length} affiliation{multiOrgCandidates.length > 1 ? "s" : ""} multi-organismes détectée{multiOrgCandidates.length > 1 ? "s" : ""}
              </span>
            </div>
            {showMultiOrg ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
          <AnimatePresence>
            {showMultiOrg && (
              <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                <div className="px-4 pb-4 border-t pt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Ces affiliations contiennent plusieurs organismes séparés par <code>;</code>. 
                    Cochez celles que vous souhaitez scinder en entrées séparées avant l'analyse.
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {multiOrgCandidates.map((candidate, i) => (
                      <div key={i}
                        className={cn("p-3 rounded-lg border cursor-pointer transition-colors",
                          selectedSplits.has(i) ? "border-amber-300 bg-amber-50/50" : "border-border bg-white/50 opacity-60")}
                        onClick={() => toggleSplit(i)}>
                        <div className="flex items-start gap-2">
                          <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                            selectedSplits.has(i) ? "border-amber-500 bg-amber-500" : "border-muted-foreground")}>
                            {selectedSplits.has(i) && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground line-through truncate">{candidate.original}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {candidate.parts.map((part, pi) => (
                                <Badge key={pi} variant="outline" className="text-[10px] h-5 font-normal bg-white">
                                  {part}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {onSplitMultiOrg && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" className="flex-1 h-8 text-xs text-white border-0"
                        style={{ background: "linear-gradient(135deg, #f59e0b, #F72585)" }}
                        onClick={handleSplit}
                        disabled={selectedSplits.size === 0}>
                        <Scissors className="w-3.5 h-3.5 mr-1.5" />
                        Scinder {selectedSplits.size} affiliation{selectedSplits.size > 1 ? "s" : ""}
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onSkip}>
                        Ignorer
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      )}
    </motion.div>
  );
}