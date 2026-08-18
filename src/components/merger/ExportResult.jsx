import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Download, RotateCcw, ArrowRight, GitMerge, RefreshCw, ChevronDown, ChevronUp, AlertCircle, Scissors, FileSpreadsheet, Building2, ExternalLink, FileText, Info } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Papa from "papaparse";

const FUSED_COLUMN = "Affiliation_Fusionnee";
const ROR_COLUMN = "ROR_ID";

function escapeHtml(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

export default function ExportResult({ approvedFusions, originalAffiliations, rawData, selectedColumn, onRestart, onReprocess, analysisOptions, variantSplits, rorIds }) {
  variantSplits = variantSplits || {};
  rorIds = rorIds || {};
  const [showFusions, setShowFusions] = useState(true);
  const [showSplits, setShowSplits] = useState(true);
  const [showPublications, setShowPublications] = useState(true);
  const [reprocessConfirm, setReprocessConfirm] = useState(false);

  const mapping = useMemo(() => { const m = {}; for (const fusion of approvedFusions) { for (const variant of fusion.variants) { m[variant.trim()] = fusion.merged_name; } } return m; }, [approvedFusions]);

  const { enrichedData, splitRowFlags, splitOrigins } = useMemo(() => {
    const rows = []; const flags = []; const origins = [];
    for (let rowIdx = 0; rowIdx < rawData.length; rowIdx++) {
      const row = rawData[rowIdx];
      const original = String(row[selectedColumn] || "").trim();
      if (variantSplits[original]) {
        const parts = variantSplits[original];
        for (let pi = 0; pi < parts.length; pi++) {
          const partTrimmed = parts[pi].trim();
          const fusedValue = mapping[partTrimmed] || partTrimmed;
          const rorId = rorIds[fusedValue] || "";
          rows.push({ ...row, [FUSED_COLUMN]: fusedValue, [ROR_COLUMN]: rorId });
          flags.push(pi > 0);
          origins.push({ originalRowIdx: rowIdx, originalText: original, splitPart: partTrimmed, partIndex: pi, totalParts: parts.length });
        }
      } else {
        const fusedValue = mapping[original] || original;
        const rorId = rorIds[fusedValue] || "";
        rows.push({ ...row, [FUSED_COLUMN]: fusedValue, [ROR_COLUMN]: rorId });
        flags.push(false);
        origins.push({ originalRowIdx: rowIdx, originalText: original, splitPart: null, partIndex: 0, totalParts: 1 });
      }
    }
    return { enrichedData: rows, splitRowFlags: flags, splitOrigins: origins };
  }, [rawData, selectedColumn, mapping, variantSplits, rorIds]);

  // ── Publications concernées par chaque scission ──────────────────────────
  const splitPublicationInfo = useMemo(() => {
    if (Object.keys(variantSplits).length === 0) return [];
    const info = [];
    for (const [originalText, parts] of Object.entries(variantSplits)) {
      const affectedRows = rawData
        .map((row, idx) => ({ row, idx, text: String(row[selectedColumn] || "").trim() }))
        .filter((r) => r.text === originalText);
      const pubIds = affectedRows.map((r) => {
        // Try to find a publication identifier column
        const idCol = Object.keys(r.row).find((k) => k.toLowerCase().match(/doi|title|publi|article|id/i));
        return idCol ? r.row[idCol] : `Ligne ${r.idx + 1}`;
      });
      info.push({
        originalText,
        parts,
        publicationCount: affectedRows.length,
        publicationIds: pubIds,
        rowsAffected: affectedRows.map((r) => r.idx),
      });
    }
    return info;
  }, [variantSplits, rawData, selectedColumn]);

  const changedCount = useMemo(() => enrichedData.filter((row) => row[FUSED_COLUMN] !== String(row[selectedColumn] || "").trim()).length, [enrichedData, selectedColumn]);
  const uniqueBefore = useMemo(() => new Set(originalAffiliations).size, [originalAffiliations]);
  const uniqueAfter = useMemo(() => new Set(enrichedData.map((r) => r[FUSED_COLUMN]).filter(Boolean)).size, [enrichedData]);
  const gainPercent = uniqueBefore > 0 ? Math.round(((uniqueBefore - uniqueAfter) / uniqueBefore) * 100) : 0;
  const splitRowsAdded = useMemo(() => splitRowFlags.filter(Boolean).length, [splitRowFlags]);
  const totalSplits = Object.keys(variantSplits).length;
  const rorCount = Object.keys(rorIds).length;
  const uniqueFusedAffiliations = useMemo(() => [...new Set(enrichedData.map((r) => String(r[FUSED_COLUMN] || "").trim()).filter(Boolean))], [enrichedData]);

  const handleDownloadCSV = () => { const csv = Papa.unparse(enrichedData, { header: true }); const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "affiliations_fusionnees.csv"; a.click(); URL.revokeObjectURL(url); };

  const handleDownloadExcel = () => {
    const columns = Object.keys(enrichedData[0] || {});
    const fusedColIdx = columns.indexOf(FUSED_COLUMN);
    const rorColIdx = columns.indexOf(ROR_COLUMN);
    let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>td, th { mso-number-format:General; font-family:Calibri,sans-serif; font-size:11px; border:1px solid #d0d0d0; padding:2px 5px; } th { font-weight:bold; }</style></head><body><table border="1"><tr>';
    for (let c = 0; c < columns.length; c++) { const isFused = c === fusedColIdx; const isRor = c === rorColIdx; const bg = isFused ? "2563EB" : isRor ? "60A5FA" : "F0F7FF"; const color = isFused || isRor ? "FFFFFF" : "333333"; html += `<th style="background:#${bg};color:#${color};font-weight:bold;">${escapeHtml(columns[c])}</th>`; }
    html += "</tr>";
    for (let r = 0; r < enrichedData.length; r++) { const row = enrichedData[r]; const isSplitRow = splitRowFlags[r]; html += "<tr>"; for (let c2 = 0; c2 < columns.length; c2++) { const isFused2 = c2 === fusedColIdx; const isRor2 = c2 === rorColIdx; let bg2 = "FFFFFF"; let fw = "normal"; if (isSplitRow) { bg2 = "FFFACD"; if (isFused2) bg2 = "DBEAFE"; if (isRor2) bg2 = "E0F2FE"; } else if (isFused2) { bg2 = "DBEAFE"; fw = "medium"; } else if (isRor2) { bg2 = "E0F2FE"; fw = "medium"; } html += `<td style="background:#${bg2};font-weight:${fw};">${escapeHtml(String(row[columns[c2]] || ""))}</td>`; } html += "</tr>"; }
    html += "</table></body></html>";
    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "affiliations_fusionnees.xls"; a.click(); URL.revokeObjectURL(url);
  };

  const handleReprocess = () => { if (onReprocess) onReprocess(enrichedData, FUSED_COLUMN, analysisOptions); };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-6">
      {/* ── Résumé ────────────────────────────────────────────────────────── */}
      <Card className="p-8 bg-card border shadow-sm rounded-3xl text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center" style={{ background: "rgba(37,99,235,0.1)" }}><CheckCircle2 className="w-8 h-8" style={{ color: "#2563EB" }} /></div>
          <div><h3 className="text-xl font-semibold">Fusion terminée !</h3><p className="text-sm text-muted-foreground mt-1">{approvedFusions.length} groupe{approvedFusions.length > 1 ? "s" : ""} fusionné{approvedFusions.length > 1 ? "s" : ""} — {changedCount} valeur{changedCount > 1 ? "s" : ""} modifiée{changedCount > 1 ? "s" : ""}</p></div>
          <div className="grid grid-cols-3 gap-3 w-full max-w-sm mt-2">
            {[{ label: "Avant", value: uniqueBefore, color: "#f59e0b" }, { label: "Réduction", value: `-${gainPercent}%`, color: "#2563EB" }, { label: "Après", value: uniqueAfter, color: "#60A5FA" }].map(({ label, value, color }) => (<div key={label} className="text-center p-3 rounded-2xl bg-muted/30 border"><p className="text-xl font-bold" style={{ color }}>{value}</p><p className="text-[10px] text-muted-foreground mt-0.5">{label}</p></div>))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {rorCount > 0 && <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: "rgba(37,99,235,0.1)", color: "#2563EB" }}><Building2 className="w-3.5 h-3.5" />{rorCount} ROR validé{rorCount > 1 ? "s" : ""}</div>}
            {splitRowsAdded > 0 && <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: "rgba(245,158,11,0.1)", color: "#d97706" }}><Scissors className="w-3.5 h-3.5" />{splitRowsAdded} ligne{splitRowsAdded > 1 ? "s" : ""} ajoutée{splitRowsAdded > 1 ? "s" : ""}</div>}
            {splitPublicationInfo.length > 0 && <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: "rgba(94,234,212,0.15)", color: "#0d9488" }}><FileText className="w-3.5 h-3.5" />{splitPublicationInfo.reduce((sum, s) => sum + s.publicationCount, 0)} publication{splitPublicationInfo.reduce((sum, s) => sum + s.publicationCount, 0) > 1 ? "s" : ""} concernée{splitPublicationInfo.reduce((sum, s) => sum + s.publicationCount, 0) > 1 ? "s" : ""}</div>}
          </div>
          <p className="text-xs text-muted-foreground">Le fichier exporté contient toutes vos colonnes originales + <span className="font-semibold" style={{ color: "#2563EB" }}>{FUSED_COLUMN}</span> + <span className="font-semibold" style={{ color: "#60A5FA" }}>{ROR_COLUMN}</span></p>
        </div>
      </Card>

      {/* ── Légende ────────────────────────────────────────────────────────── */}
      <Card className="p-4 bg-card border shadow-sm rounded-2xl">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Légende (Excel coloré)</p>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2"><div className="w-5 h-5 rounded-lg border" style={{ background: "#2563EB" }} /><span className="text-xs">Colonne Affiliation_Fusionnee</span></div>
          <div className="flex items-center gap-2"><div className="w-5 h-5 rounded-lg border" style={{ background: "#60A5FA" }} /><span className="text-xs">Colonne ROR_ID</span></div>
          <div className="flex items-center gap-2"><div className="w-5 h-5 rounded-lg border" style={{ background: "#DBEAFE" }} /><span className="text-xs">Cellules fusionnées</span></div>
          <div className="flex items-center gap-2"><div className="w-5 h-5 rounded-lg border" style={{ background: "#FFFACD" }} /><span className="text-xs">Lignes de scission</span></div>
        </div>
      </Card>

      {/* ── Publications concernées par les scissions ────────────────────────── */}
      {splitPublicationInfo.length > 0 && (
        <Card className="overflow-hidden bg-card border border-teal-200 shadow-sm rounded-2xl">
          <button className="w-full flex items-center justify-between p-4 border-b hover:bg-muted/20 transition-colors" onClick={() => setShowPublications((s) => !s)}>
            <h4 className="font-semibold flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4" style={{ color: "#0d9488" }} />
              Publications concernées par les scissions ({splitPublicationInfo.length})
              <Badge variant="outline" className="ml-1 text-[10px] h-5 font-normal bg-teal-50 border-teal-200 text-teal-700">
                {splitPublicationInfo.reduce((sum, s) => sum + s.publicationCount, 0)} pub{splitPublicationInfo.reduce((sum, s) => sum + s.publicationCount, 0) > 1 ? "s" : ""}
              </Badge>
            </h4>
            {showPublications ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          <AnimatePresence>
            {showPublications && (
              <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-teal-50 border border-teal-200">
                    <Info className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-teal-700 leading-relaxed">
                      Chaque scission génère une ligne supplémentaire par affiliation dans le fichier d'export.
                      Voici les publications impactées et le nombre de lignes ajoutées.
                    </p>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {splitPublicationInfo.map((info, i) => (
                      <div key={i} className="p-3 rounded-xl border bg-card">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Scissors className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span className="text-xs text-muted-foreground truncate">"{info.originalText}"</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline" className="text-[10px] h-5 font-normal bg-teal-50 border-teal-200 text-teal-700">
                              <FileText className="w-2.5 h-2.5 mr-1" />{info.publicationCount} pub{info.publicationCount > 1 ? "s" : ""}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] h-5 font-normal bg-amber-50 border-amber-200 text-amber-700">
                              +{(info.parts.length - 1) * info.publicationCount} ligne{(info.parts.length - 1) * info.publicationCount > 1 ? "s" : ""}
                            </Badge>
                          </div>
                        </div>
                        {/* Affiliations scindées */}
                        <div className="flex flex-wrap gap-1 ml-6">
                          {info.parts.map((part, pi) => (
                            <span key={pi} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                              {pi > 0 && <ArrowRight className="w-2.5 h-2.5 inline mr-0.5" />}{part}
                            </span>
                          ))}
                        </div>
                        {/* IDs publications */}
                        {info.publicationIds.length > 0 && info.publicationIds.length <= 10 && (
                          <div className="ml-6 mt-2 flex flex-wrap gap-1">
                            {info.publicationIds.map((pubId, pi) => (
                              <span key={pi} className="text-[9px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-mono">
                                {String(pubId).substring(0, 40)}
                              </span>
                            ))}
                          </div>
                        )}
                        {info.publicationIds.length > 10 && (
                          <p className="ml-6 mt-1 text-[10px] text-muted-foreground">
                            {info.publicationIds.length} publications — affichage limité aux 10 premières
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      )}

      {/* ── ROR validés ─────────────────────────────────────────────────────── */}
      {rorCount > 0 && (
        <Card className="overflow-hidden bg-card border border-blue-200 shadow-sm rounded-2xl">
          <div className="p-4 border-b"><h4 className="font-semibold flex items-center gap-2 text-sm"><Building2 className="w-4 h-4" style={{ color: "#2563EB" }} />Identifiants ROR validés ({rorCount})</h4></div>
          <div className="max-h-48 overflow-y-auto"><Table><TableHeader><TableRow><TableHead>Nom fusionné</TableHead><TableHead>ROR ID</TableHead></TableRow></TableHeader><TableBody>
            {Object.entries(rorIds).map(([name, rorId]) => (<TableRow key={name}><TableCell><span className="text-sm font-medium">{name}</span></TableCell><TableCell><a href={rorId} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1"><ExternalLink className="w-3 h-3" />{rorId}</a></TableCell></TableRow>))}
          </TableBody></Table></div>
        </Card>
      )}

      {/* ── Affiliations scindées ─────────────────────────────────────────────── */}
      {totalSplits > 0 && (
        <Card className="overflow-hidden bg-card border border-amber-200 shadow-sm rounded-2xl">
          <button className="w-full flex items-center justify-between p-4 border-b hover:bg-muted/20 transition-colors" onClick={() => setShowSplits((s) => !s)}><h4 className="font-semibold flex items-center gap-2 text-sm"><Scissors className="w-4 h-4" style={{ color: "#f59e0b" }} />Affiliations scindées ({totalSplits})</h4>{showSplits ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}</button>
          <AnimatePresence>{showSplits && (<motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden"><div className="max-h-64 overflow-y-auto"><Table><TableHeader><TableRow><TableHead>Variante originale</TableHead><TableHead>Scindée en</TableHead></TableRow></TableHeader><TableBody>
            {Object.entries(variantSplits).map(([original, parts]) => (<TableRow key={original}><TableCell><span className="text-xs text-muted-foreground">{original}</span></TableCell><TableCell><div className="flex flex-wrap gap-1">{parts.map((part, j) => <Badge key={j} variant="outline" className="text-xs font-normal bg-amber-50 border-amber-200">{part}</Badge>)}</div></TableCell></TableRow>))}
          </TableBody></Table></div></motion.div>)}</AnimatePresence>
        </Card>
      )}

      {/* ── Résumé des fusions ─────────────────────────────────────────────────── */}
      {approvedFusions.length > 0 && (
        <Card className="overflow-hidden bg-card border shadow-sm rounded-2xl">
          <button className="w-full flex items-center justify-between p-4 border-b hover:bg-muted/20 transition-colors" onClick={() => setShowFusions((s) => !s)}><h4 className="font-semibold flex items-center gap-2 text-sm"><GitMerge className="w-4 h-4" style={{ color: "#2563EB" }} />Résumé des fusions validées ({approvedFusions.length})</h4>{showFusions ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}</button>
          <AnimatePresence>{showFusions && (<motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden"><div className="max-h-64 overflow-y-auto"><Table><TableHeader><TableRow><TableHead>Variantes fusionnées</TableHead><TableHead>Nom fusionné</TableHead></TableRow></TableHeader><TableBody>
            {approvedFusions.map((fusion, i) => (<TableRow key={i}><TableCell><div className="flex flex-wrap gap-1">{fusion.variants.map((v, j) => <Badge key={j} variant="outline" className="text-xs font-normal">{v}</Badge>)}</div></TableCell><TableCell><div className="flex items-center gap-2"><ArrowRight className="w-3 h-3 shrink-0" style={{ color: "#f59e0b" }} /><span className="font-medium text-sm">{fusion.merged_name}</span></div></TableCell></TableRow>))}
          </TableBody></Table></div></motion.div>)}</AnimatePresence>
        </Card>
      )}

      {/* ── Retraitement ──────────────────────────────────────────────────────── */}
      {onReprocess && (
        <Card className="p-5 bg-card border-2 border-dashed border-blue-200 shadow-sm rounded-2xl">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "rgba(37,99,235,0.08)" }}><RefreshCw className="w-5 h-5" style={{ color: "#2563EB" }} /></div>
            <div className="flex-1"><h4 className="text-sm font-semibold">Lancer un nouveau tour de fusion</h4><p className="text-xs text-muted-foreground mt-1 leading-relaxed">Relancer l'analyse sur la colonne <span className="font-semibold" style={{ color: "#2563EB" }}>{FUSED_COLUMN}</span> ({uniqueFusedAffiliations.length} dénomination{uniqueFusedAffiliations.length > 1 ? "s" : ""} unique{uniqueFusedAffiliations.length > 1 ? "s" : ""}) pour détecter d'éventuelles fusions supplémentaires.</p>
              <AnimatePresence>{!reprocessConfirm ? (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Button variant="outline" size="sm" className="mt-3 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 rounded-lg" onClick={() => setReprocessConfirm(true)}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Retraiter avec "{FUSED_COLUMN}"</Button></motion.div>) : (<motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-2"><div className="flex items-start gap-2"><AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" /><p className="text-xs text-blue-700">L'analyse va repartir de zéro sur la colonne fusionnée.</p></div><div className="flex gap-2"><Button size="sm" className="h-7 text-xs text-white border-0 rounded-lg" style={{ background: "#2563EB" }} onClick={handleReprocess}><RefreshCw className="w-3.5 h-3.5 mr-1" />Confirmer</Button><Button variant="outline" size="sm" className="h-7 text-xs rounded-lg" onClick={() => setReprocessConfirm(false)}>Annuler</Button></div></motion.div>)}</AnimatePresence>
            </div>
          </div>
        </Card>
      )}

      {/* ── Boutons de téléchargement ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex gap-3"><Button variant="outline" className="flex-1 rounded-xl" onClick={onRestart}><RotateCcw className="w-4 h-4 mr-2" />Recommencer</Button><Button variant="outline" className="flex-1 rounded-xl" onClick={handleDownloadCSV}><Download className="w-4 h-4 mr-2" />CSV (brut)</Button></div>
        <Button className="w-full text-white border-0 h-11 rounded-xl shadow-sm" style={{ background: "#2563EB" }} onClick={handleDownloadExcel}><FileSpreadsheet className="w-4 h-4 mr-2" />Télécharger Excel (coloré)</Button>
      </div>
    </motion.div>
  );
}
