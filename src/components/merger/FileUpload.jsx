import React, { useCallback, useState } from "react";
import { Upload, FileSpreadsheet, AlertCircle, ChevronDown, Check, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import DictionaryManager from "./DictionaryManager";

async function parseFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "csv") {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: (r) => resolve(r.data),
        error: (e) => reject(e),
      });
    });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, { defval: "" }));
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Erreur de lecture"));
    reader.readAsArrayBuffer(file);
  });
}

function InfoTooltip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow((s) => !s)}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
            className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2.5 rounded-lg bg-foreground text-background text-xs shadow-lg leading-relaxed"
          >
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

export default function FileUpload({ onFileProcessed, dictionaryProps }) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [columns, setColumns] = useState([]);
  const [selectedColumn, setSelectedColumn] = useState(null);
  const [rawData, setRawData] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [stats, setStats] = useState(null);

  // Options d'analyse
  const [useBatches, setUseBatches] = useState(false);
  const [minConfidence, setMinConfidence] = useState(50);

  const computeStats = (data, col, colCount) => {
    const values = data.map((r) => String(r[col] || "").trim()).filter(Boolean);
    setStats({ rows: data.length, cols: colCount, unique: new Set(values).size });
  };

  const handleFilePicked = useCallback(async (file) => {
    setError(null); setColumns([]); setSelectedColumn(null); setRawData(null); setStats(null);
    setFileName(file.name);
    const validTypes = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv"];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setError("Veuillez importer un fichier Excel (.xlsx, .xls) ou CSV."); return;
    }
    try {
      const data = await parseFile(file);
      if (!Array.isArray(data) || data.length === 0) { setError("Le fichier semble vide."); return; }
      const cols = Object.keys(data[0]);
      setRawData(data); setColumns(cols);
      const auto = cols.find((c) => c.toLowerCase().includes("affiliation")) || cols[0];
      setSelectedColumn(auto);
      computeStats(data, auto, cols.length);
    } catch (err) { setError("Erreur : " + err.message); }
  }, []);

  const handleColumnChange = (col) => {
    setSelectedColumn(col); setDropdownOpen(false);
    if (rawData) computeStats(rawData, col, columns.length);
  };

  const handleConfirm = useCallback(() => {
    if (!rawData || !selectedColumn) return;
    const affiliations = rawData.map((r) => r[selectedColumn]).filter((a) => a && String(a).trim() !== "");
    const unique = [...new Set(affiliations.map((a) => String(a).trim()))];
    if (unique.length === 0) { setError("Colonne vide."); return; }
    onFileProcessed(unique, rawData, selectedColumn, { useBatches, minConfidence });
  }, [rawData, selectedColumn, useBatches, minConfidence, onFileProcessed]);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>

      {/* Dictionnaire */}
      {dictionaryProps && <DictionaryManager {...dictionaryProps} />}

      <Card className="p-8 border-dashed border-2 bg-card/50 backdrop-blur-sm">

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.[0]) handleFilePicked(e.dataTransfer.files[0]); }}
          className={`flex flex-col items-center justify-center p-12 rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer mb-6 ${dragActive ? "scale-[1.01] border-purple-400 bg-purple-50/30" : "border-border hover:bg-muted/30"}`}
          onClick={() => !columns.length && document.getElementById("file-input").click()}
        >
          <input id="file-input" type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleFilePicked(e.target.files[0]); }} />
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(114,9,183,0.12), rgba(76,201,240,0.12))" }}>
              {fileName
                ? <FileSpreadsheet className="w-8 h-8" style={{ color: "#7209B7" }} />
                : <Upload className="w-8 h-8" style={{ color: "#4361EE" }} />}
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">{fileName || "Glissez-déposez votre fichier ici"}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {fileName
                  ? <span className="text-green-600 font-medium">✓ Fichier chargé — choisissez la colonne ci-dessous</span>
                  : "ou cliquez pour parcourir • .xlsx, .xls, .csv"}
              </p>
            </div>
            {fileName && (
              <button className="text-xs text-muted-foreground underline"
                onClick={(e) => { e.stopPropagation(); document.getElementById("file-input").click(); }}>
                Changer de fichier
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {columns.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }} className="space-y-4">

              {/* Sélecteur colonne + stats */}
              <div className="p-4 rounded-lg space-y-3"
                style={{ background: "linear-gradient(135deg, rgba(114,9,183,0.05), rgba(76,201,240,0.07))", border: "1px solid rgba(114,9,183,0.12)" }}>
                <p className="text-sm font-medium">Sélectionnez la colonne à fusionner</p>

                <div className="relative">
                  <button onClick={() => setDropdownOpen((o) => !o)}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border bg-background text-sm font-medium shadow-sm hover:bg-muted/40 transition-colors">
                    <span style={{ color: "#7209B7" }}>{selectedColumn}</span>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {dropdownOpen && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="absolute z-20 mt-1 w-full rounded-lg border bg-background shadow-lg overflow-hidden">
                        <div className="max-h-48 overflow-y-auto py-1">
                          {columns.map((col) => (
                            <button key={col} onClick={() => handleColumnChange(col)}
                              className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-muted/50 transition-colors text-left">
                              <span>{col}</span>
                              {col === selectedColumn && <Check className="w-4 h-4" style={{ color: "#7209B7" }} />}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {stats && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[
                      { label: "Lignes", value: stats.rows.toLocaleString() },
                      { label: "Colonnes", value: stats.cols },
                      { label: "Dénominations uniques", value: stats.unique.toLocaleString() },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-center p-2 rounded-lg bg-white/60 border border-white">
                        <p className="text-lg font-bold" style={{ color: "#7209B7" }}>{value}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Options d'analyse */}
              <div className="p-4 rounded-lg space-y-4 border bg-white/50">
                <p className="text-sm font-medium text-foreground">Options d'analyse</p>

                {/* Mode traitement */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Mode de traitement</span>
                    <InfoTooltip text="Le traitement par lot découpe vos affiliations en groupes de 50 et envoie plusieurs requêtes à l'IA. Plus lent mais plus fiable sur de grands volumes (>200 affiliations). Le mode unique envoie tout en une seule requête, plus rapide mais peut manquer des fusions sur de grands volumes." />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: false, label: "Appel unique", desc: "Rapide, 1 requête" },
                      { value: true, label: "Par lots de 50", desc: "Fiable, grands volumes" },
                    ].map(({ value, label, desc }) => (
                      <button key={String(value)} onClick={() => setUseBatches(value)}
                        className={`flex flex-col items-center p-3 rounded-lg border-2 text-xs transition-all ${useBatches === value ? "border-purple-400 bg-purple-50" : "border-border bg-white hover:bg-muted/20"}`}>
                        <span className={`font-semibold ${useBatches === value ? "text-purple-700" : "text-foreground"}`}>{label}</span>
                        <span className="text-muted-foreground mt-0.5">{desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Seuil de confiance */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Seuil de confiance minimum</span>
                      <InfoTooltip text="L'IA attribue un score de confiance à chaque groupe détecté. En fixant un seuil plus élevé, vous ne verrez que les fusions dont l'IA est très sûre. Un seuil de 0% affiche tout, 80% n'affiche que les fusions très fiables." />
                    </div>
                    <span className="text-sm font-bold" style={{ color: "#7209B7" }}>{minConfidence}%</span>
                  </div>
                  <input type="range" min={0} max={95} step={5} value={minConfidence}
                    onChange={(e) => setMinConfidence(Number(e.target.value))}
                    className="w-full accent-purple-600 cursor-pointer" />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>0% — tout afficher</span>
                    <span>50% — moyen</span>
                    <span>80% — élevé</span>
                  </div>
                </div>
              </div>

              <Button className="w-full text-white border-0"
                style={{ background: "linear-gradient(135deg, #7209B7, #4CC9F0)" }}
                onClick={handleConfirm}>
                Analyser la colonne "{selectedColumn}"
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 flex items-start gap-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}