import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Download, RotateCcw, ArrowRight,
  GitMerge, RefreshCw, ChevronDown, ChevronUp, AlertCircle
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Papa from "papaparse";

const FUSED_COLUMN = "Affiliation_Fusionnee";

export default function ExportResult({
  approvedFusions,
  originalAffiliations,
  rawData,
  selectedColumn,
  onRestart,
  onReprocess, // callback(enrichedData, fusedColumnName, analysisOptions)
  analysisOptions,
}) {
  const [showFusions, setShowFusions] = useState(true);
  const [reprocessConfirm, setReprocessConfirm] = useState(false);

  // ── Mapping variante → nom fusionné ──────────────────────────
  const mapping = useMemo(() => {
    const m = {};
    for (const fusion of approvedFusions) {
      for (const variant of fusion.variants) {
        m[variant.trim()] = fusion.merged_name;
      }
    }
    return m;
  }, [approvedFusions]);

  // ── Données enrichies ─────────────────────────────────────────
  const enrichedData = useMemo(() => {
    return rawData.map((row) => {
      const original = String(row[selectedColumn] || "").trim();
      return { ...row, [FUSED_COLUMN]: mapping[original] || original };
    });
  }, [rawData, selectedColumn, mapping]);

  // ── Stats ────────────────────────────────────────────────────
  const changedCount = useMemo(() =>
    enrichedData.filter((row) => row[FUSED_COLUMN] !== String(row[selectedColumn] || "").trim()).length,
    [enrichedData, selectedColumn]
  );

  const uniqueBefore = useMemo(() => new Set(originalAffiliations).size, [originalAffiliations]);

  const uniqueAfter = useMemo(() =>
    new Set(enrichedData.map((r) => r[FUSED_COLUMN]).filter(Boolean)).size,
    [enrichedData]
  );

  const gainPercent = uniqueBefore > 0
    ? Math.round(((uniqueBefore - uniqueAfter) / uniqueBefore) * 100)
    : 0;

  // ── Export CSV ───────────────────────────────────────────────
  const handleDownload = () => {
    const csv = Papa.unparse(enrichedData, { header: true });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "affiliations_fusionnees.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Retraitement ─────────────────────────────────────────────
  const handleReprocess = () => {
    if (onReprocess) {
      onReprocess(enrichedData, FUSED_COLUMN, analysisOptions);
    }
  };

  // Compter les affiliations uniques restantes dans la colonne fusionnée
  const uniqueFusedAffiliations = useMemo(() =>
    [...new Set(enrichedData.map((r) => String(r[FUSED_COLUMN] || "").trim()).filter(Boolean))],
    [enrichedData]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Bannière succès */}
      <Card className="p-8 bg-card/50 backdrop-blur-sm text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgba(76,201,240,0.2), rgba(67,97,238,0.15))" }}>
            <CheckCircle2 className="w-8 h-8" style={{ color: "#4CC9F0" }} />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-foreground">Fusion terminée !</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {approvedFusions.length} groupe{approvedFusions.length > 1 ? "s" : ""} fusionné{approvedFusions.length > 1 ? "s" : ""} ·{" "}
              {changedCount} valeur{changedCount > 1 ? "s" : ""} modifiée{changedCount > 1 ? "s" : ""}
            </p>
          </div>

          {/* Stats avant / après */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-sm mt-2">
            {[
              { label: "Avant", value: uniqueBefore, color: "#F72585" },
              { label: "Réduction", value: `-${gainPercent}%`, color: "#7209B7" },
              { label: "Après", value: uniqueAfter, color: "#4CC9F0" },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center p-3 rounded-xl bg-white/60 border">
                <p className="text-xl font-bold" style={{ color }}>{value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            Le fichier exporté contient toutes vos colonnes originales +{" "}
            <span className="font-semibold" style={{ color: "#7209B7" }}>{FUSED_COLUMN}</span>
          </p>
        </div>
      </Card>

      {/* Résumé des fusions */}
      {approvedFusions.length > 0 && (
        <Card className="overflow-hidden bg-card/50 backdrop-blur-sm">
          <button
            className="w-full flex items-center justify-between p-4 border-b hover:bg-muted/20 transition-colors"
            onClick={() => setShowFusions((s) => !s)}
          >
            <h4 className="font-semibold flex items-center gap-2 text-sm">
              <GitMerge className="w-4 h-4" style={{ color: "#7209B7" }} />
              Résumé des fusions validées ({approvedFusions.length})
            </h4>
            {showFusions ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          <AnimatePresence>
            {showFusions && (
              <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variantes fusionnées</TableHead>
                        <TableHead>Nom fusionné</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {approvedFusions.map((fusion, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {fusion.variants.map((v, j) => (
                                <Badge key={j} variant="outline" className="text-xs font-normal">{v}</Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <ArrowRight className="w-3 h-3 shrink-0" style={{ color: "#F72585" }} />
                              <span className="font-medium text-sm">{fusion.merged_name}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      )}

      {/* Bloc retraitement */}
      {onReprocess && (
        <Card className="p-5 bg-card/50 backdrop-blur-sm border-2 border-dashed border-purple-200">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, rgba(114,9,183,0.1), rgba(76,201,240,0.1))" }}>
              <RefreshCw className="w-5 h-5" style={{ color: "#7209B7" }} />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-foreground">Lancer un nouveau tour de fusion</h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Relancer l'analyse sur la colonne{" "}
                <span className="font-semibold" style={{ color: "#7209B7" }}>{FUSED_COLUMN}</span>{" "}
                ({uniqueFusedAffiliations.length} dénomination{uniqueFusedAffiliations.length > 1 ? "s" : ""} unique{uniqueFusedAffiliations.length > 1 ? "s" : ""}) pour détecter d'éventuelles fusions supplémentaires.
              </p>

              <AnimatePresence>
                {!reprocessConfirm ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 text-xs border-purple-300 text-purple-700 hover:bg-purple-50"
                      onClick={() => setReprocessConfirm(true)}
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      Retraiter avec "{FUSED_COLUMN}"
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="mt-3 p-3 rounded-lg bg-purple-50 border border-purple-200 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-purple-700">
                        L'analyse va repartir de zéro sur la colonne fusionnée. Les fusions actuelles seront conservées dans le dictionnaire si vous les y avez ajoutées.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs text-white border-0"
                        style={{ background: "linear-gradient(135deg, #7209B7, #4CC9F0)" }}
                        onClick={handleReprocess}>
                        <RefreshCw className="w-3 h-3 mr-1" />Confirmer
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs"
                        onClick={() => setReprocessConfirm(false)}>
                        Annuler
      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </Card>
      )}

      {/* Actions principales */}
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onRestart}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Recommencer
        </Button>
        <Button className="flex-1 text-white border-0"
          style={{ background: "linear-gradient(135deg, #7209B7, #4CC9F0)" }}
          onClick={handleDownload}>
          <Download className="w-4 h-4 mr-2" />
          Télécharger le CSV
        </Button>
      </div>
    </motion.div>
  );
}