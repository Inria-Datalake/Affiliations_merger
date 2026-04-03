/**
 * PipelinePanel.jsx
 * Panneau de contrôle du pipeline Python affiliation_merger.py.
 * Permet de :
 *  - Vérifier les dépendances Python (rapidfuzz, sklearn, SBERT, unidecode)
 *  - Configurer les paramètres (seuil fuzzy, SBERT, filtre, etc.)
 *  - Lancer le pipeline et suivre les logs en temps réel
 *  - Afficher les statistiques de résolution après exécution
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Play, Square, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, AlertCircle, Loader2,
  Terminal, Settings, Zap, Brain, Filter, FileOutput,
  Package, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SERVER = "http://localhost:3001";
const POLL_INTERVAL_MS = 1200;

// ── Badge de statut dépendance ─────────────────────────────────────────────
function DepBadge({ name, available, description }) {
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors",
      available
        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
        : "bg-red-50 border-red-200 text-red-800"
    )}>
      {available
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
      }
      <div className="min-w-0">
        <span className="font-mono font-semibold">{name}</span>
        {description && <span className="ml-1 text-[10px] opacity-70">— {description}</span>}
      </div>
    </div>
  );
}

// ── Ligne de log colorée ───────────────────────────────────────────────────
function LogLine({ msg }) {
  const isError   = /erreur|error|traceback|exception/i.test(msg);
  const isSuccess = /✅|résolues|terminé|sauvegardé/i.test(msg);
  const isStep    = /^(📂|🔤|📋|🔡|🗺️|🔍|💾|📊|⏭️|🔄)/u.test(msg);

  return (
    <div className={cn("font-mono text-[11px] leading-5 whitespace-pre-wrap break-all",
      isError   && "text-red-500",
      isSuccess && "text-emerald-600",
      isStep    && "text-blue-600 font-semibold",
      !isError && !isSuccess && !isStep && "text-muted-foreground",
    )}>
      {msg}
    </div>
  );
}

// ── Jauge de score de confiance ────────────────────────────────────────────
function ConfidenceGauge({ label, value, color }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{label}</div>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────
export default function PipelinePanel({ inputFile, onComplete }) {
  // Dépendances
  const [deps, setDeps] = useState(null);
  const [depsLoading, setDepsLoading] = useState(false);

  // Paramètres pipeline
  const [params, setParams] = useState({
    outputFile:  "affiliation_merged.xlsx",
    threshold:   0.82,
    useFuzzy:    true,
    useSbert:    true,
    applyFilter: true,
    saveFailed:  true,
  });
  const [showSettings, setShowSettings] = useState(false);

  // État pipeline
  const [status, setStatus] = useState(null);
  const [polling, setPolling] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const logsRef = useRef(null);
  const pollRef = useRef(null);

  // ── Vérification des dépendances ──────────────────────────────────────────
  const checkDeps = useCallback(async () => {
    setDepsLoading(true);
    try {
      const res = await fetch(`${SERVER}/api/fuzzy/dependencies`, {
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      setDeps(data.dependencies || {});
    } catch {
      setDeps(null);
    } finally {
      setDepsLoading(false);
    }
  }, []);

  useEffect(() => { checkDeps(); }, [checkDeps]);

  // ── Polling du statut pipeline ────────────────────────────────────────────
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPolling(true);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${SERVER}/api/pipeline/status`, {
          signal: AbortSignal.timeout(3000),
        });
        const data = await res.json();
        setStatus(data);
        // Auto-scroll logs
        if (logsRef.current) {
          logsRef.current.scrollTop = logsRef.current.scrollHeight;
        }
        // Arrêt du polling quand terminé
        if (!data.running && data.exitCode !== null) {
          clearInterval(pollRef.current);
          setPolling(false);
          if (data.exitCode === 0 && onComplete) {
            onComplete(data.outputFile);
          }
        }
      } catch {
        // serveur temporairement indisponible → on continue
      }
    }, POLL_INTERVAL_MS);
  }, [onComplete]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Lancement du pipeline ─────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (!inputFile) return;
    setStatus(null);
    setShowLogs(true);
    try {
      const res = await fetch(`${SERVER}/api/pipeline/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputFile, ...params }),
      });
      const data = await res.json();
      if (data.ok) {
        startPolling();
      } else {
        setStatus({ running: false, error: data.error, logs: [] });
      }
    } catch (err) {
      setStatus({ running: false, error: err.message, logs: [] });
    }
  }, [inputFile, params, startPolling]);

  // ── Arrêt du pipeline ─────────────────────────────────────────────────────
  const handleKill = useCallback(async () => {
    try {
      await fetch(`${SERVER}/api/pipeline/kill`, { method: "DELETE" });
      clearInterval(pollRef.current);
      setPolling(false);
    } catch { }
  }, []);

  // ── Extraction statistiques depuis les logs ────────────────────────────────
  const parseStats = (logs = []) => {
    const stats = {};
    for (const { msg } of logs) {
      const mResolved = msg.match(/Résolues par dictionnaire\s*:\s*(\d+)/);
      if (mResolved) stats.byDict = parseInt(mResolved[1]);
      const mFuzzy = msg.match(/Fuzzy\s*:\s*(\d+)/);
      if (mFuzzy) stats.byFuzzy = parseInt(mFuzzy[1]);
      const mTotal = msg.match(/(\d+) lignes après explosion/);
      if (mTotal) stats.total = parseInt(mTotal[1]);
      const mFinal = msg.match(/Résultat final \((\d+) lignes\)/);
      if (mFinal) stats.final = parseInt(mFinal[1]);
      const mUnresolved = msg.match(/Non résolues \((\d+) uniques\)/);
      if (mUnresolved) stats.unresolved = parseInt(mUnresolved[1]);
    }
    return stats;
  };

  const stats       = parseStats(status?.logs);
  const isRunning   = status?.running === true || polling;
  const isDone      = !isRunning && status?.exitCode === 0;
  const isFailed    = !isRunning && status?.exitCode != null && status.exitCode !== 0;

  // ── Pip install commands ──────────────────────────────────────────────────
  const getMissingInstall = () => {
    if (!deps) return "";
    const pkgs = [];
    if (!deps.rapidfuzz)             pkgs.push("rapidfuzz");
    if (!deps.sklearn)               pkgs.push("scikit-learn");
    if (!deps.sentence_transformers) pkgs.push("sentence-transformers");
    if (!deps.unidecode)             pkgs.push("unidecode");
    if (!deps.numpy)                 pkgs.push("numpy");
    return pkgs.length ? `pip install ${pkgs.join(" ")}` : "";
  };

  const missingCmd = getMissingInstall();
  const allDepsOk  = deps && Object.values(deps).every(Boolean);

  return (
    <div className="space-y-4">

      {/* ── En-tête ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-1">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #7209B7, #4CC9F0)" }}>
          <Activity className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold">Pipeline Python</p>
          <p className="text-[11px] text-muted-foreground">
            Fuzzy matching TF-IDF · Levenshtein · SBERT multilingue
          </p>
        </div>
      </div>

      {/* ── Dépendances Python ────────────────────────────────────────────── */}
      <Card className="p-4 bg-white/70 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold">Dépendances Python</span>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={checkDeps} disabled={depsLoading}>
            {depsLoading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>

        {deps === null && !depsLoading && (
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg p-2.5 border border-amber-200">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Serveur Node.js non joignable — lancez <code className="font-mono mx-1">npm run server</code>
          </div>
        )}

        {deps && (
          <div className="grid grid-cols-2 gap-2">
            <DepBadge name="rapidfuzz"             available={deps.rapidfuzz}             description="Levenshtein" />
            <DepBadge name="scikit-learn"          available={deps.sklearn}               description="TF-IDF" />
            <DepBadge name="sentence-transformers" available={deps.sentence_transformers} description="SBERT multilingue" />
            <DepBadge name="unidecode"             available={deps.unidecode}             description="Accents" />
          </div>
        )}

        {missingCmd && (
          <div className="mt-1 p-2.5 rounded-lg bg-slate-900 text-emerald-400 font-mono text-[11px] flex items-start gap-2">
            <Terminal className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-500" />
            <span className="break-all">{missingCmd}</span>
          </div>
        )}
      </Card>

      {/* ── Paramètres ────────────────────────────────────────────────────── */}
      <Card className="overflow-hidden bg-white/70">
        <button
          onClick={() => setShowSettings((s) => !s)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold">Paramètres du pipeline</span>
          </div>
          {showSettings
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>

        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
              className="overflow-hidden">
              <div className="px-4 pb-4 border-t pt-4 space-y-4">

                {/* Seuil fuzzy */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-xs font-medium">Seuil fuzzy</span>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs h-5 px-2">
                      {params.threshold.toFixed(2)}
                    </Badge>
                  </div>
                  <Slider
                    min={0.6} max={0.99} step={0.01}
                    value={[params.threshold]}
                    onValueChange={([v]) => setParams((p) => ({ ...p, threshold: v }))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>0.60 — permissif</span>
                    <span className="text-center">0.82 — recommandé</span>
                    <span>0.99 — strict</span>
                  </div>
                  {/* Légende seuils */}
                  <div className="grid grid-cols-3 gap-1 mt-1">
                    {[
                      { label: "≥ 0.92", desc: "Auto-fusion", color: "#059669" },
                      { label: "0.75–0.91", desc: "À réviser", color: "#f59e0b" },
                      { label: "< 0.75", desc: "Manuel", color: "#ef4444" },
                    ].map(({ label, desc, color }) => (
                      <div key={label} className="text-center p-1.5 rounded-lg border bg-white/50">
                        <div className="text-[11px] font-semibold" style={{ color }}>{label}</div>
                        <div className="text-[10px] text-muted-foreground">{desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Toggles */}
                <div className="space-y-2">
                  {[
                    { key: "useFuzzy",    icon: <Zap className="w-3.5 h-3.5" />,       label: "Fuzzy matching",           sub: "TF-IDF + Levenshtein" },
                    { key: "useSbert",    icon: <Brain className="w-3.5 h-3.5" />,      label: "SBERT multilingue",        sub: "fr/en/es — plus lent mais précis", disabled: !params.useFuzzy || !deps?.sentence_transformers },
                    { key: "applyFilter", icon: <Filter className="w-3.5 h-3.5" />,     label: "Filtre primary/dept",      sub: "Retire les affiliations sans institution" },
                    { key: "saveFailed",  icon: <FileOutput className="w-3.5 h-3.5" />, label: "Exporter les non-résolus", sub: "Fichier _unresolved.xlsx" },
                  ].map(({ key, icon, label, sub, disabled }) => (
                    <div
                      key={key}
                      onClick={() => !disabled && setParams((p) => ({ ...p, [key]: !p[key] }))}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        params[key] && !disabled ? "border-violet-200 bg-violet-50/50" : "border-border bg-white/40",
                        disabled && "opacity-40 cursor-not-allowed"
                      )}>
                      <div className={cn("shrink-0 transition-colors", params[key] && !disabled ? "text-violet-600" : "text-muted-foreground")}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium">{label}</div>
                        <div className="text-[10px] text-muted-foreground">{sub}</div>
                      </div>
                      <div className={cn(
                        "w-8 h-4 rounded-full transition-colors relative shrink-0",
                        params[key] && !disabled ? "bg-violet-600" : "bg-muted"
                      )}>
                        <div className={cn(
                          "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform",
                          params[key] && !disabled ? "translate-x-4" : "translate-x-0.5"
                        )} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Fichier de sortie */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Fichier de sortie</label>
                  <input
                    value={params.outputFile}
                    onChange={(e) => setParams((p) => ({ ...p, outputFile: e.target.value }))}
                    className="w-full h-8 px-3 text-xs rounded-lg border bg-white/70 font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
                    placeholder="affiliation_merged.xlsx"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* ── Boutons d'action ──────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <Button
          className="flex-1 h-10 text-sm font-semibold text-white border-0 disabled:opacity-50"
          style={{ background: isRunning ? "#94a3b8" : "linear-gradient(135deg, #7209B7, #4CC9F0)" }}
          onClick={handleRun}
          disabled={isRunning || !inputFile}>
          {isRunning
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> En cours…</>
            : <><Play className="w-4 h-4 mr-2" /> Lancer le pipeline</>}
        </Button>
        {isRunning && (
          <Button variant="outline" size="icon" className="h-10 w-10" onClick={handleKill}>
            <Square className="w-4 h-4 text-red-500" />
          </Button>
        )}
      </div>

      {!inputFile && (
        <p className="text-[11px] text-center text-amber-600">
          ⚠️ Déposez votre fichier Excel dans le dossier <code className="font-mono">outputs/</code> et renseignez son nom ci-dessus
        </p>
      )}

      {/* ── Statistiques (après exécution) ────────────────────────────────── */}
      <AnimatePresence>
        {isDone && Object.keys(stats).length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="p-4 bg-emerald-50/70 border-emerald-200 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-800">Pipeline terminé avec succès</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <ConfidenceGauge label="Lignes totales"   value={stats.total ?? "—"}      color="#374151" />
                <ConfidenceGauge label="Par dictionnaire" value={stats.byDict ?? "—"}      color="#7209B7" />
                <ConfidenceGauge label="Par fuzzy"        value={stats.byFuzzy ?? "—"}     color="#4CC9F0" />
                <ConfidenceGauge label="Non résolues"     value={stats.unresolved ?? "—"}  color="#f59e0b" />
              </div>
              {stats.final && (
                <div className="text-center text-[11px] text-emerald-700 font-medium pt-1 border-t border-emerald-200">
                  → {stats.final} lignes dans <code className="font-mono">{params.outputFile}</code>
                </div>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Erreur ────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isFailed && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="p-4 bg-red-50/70 border-red-200">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-xs font-semibold text-red-700">Erreur pipeline (code {status?.exitCode})</span>
              </div>
              {status?.error && (
                <p className="mt-2 text-[11px] font-mono text-red-600">{status.error}</p>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Logs ──────────────────────────────────────────────────────────── */}
      {status && (
        <Card className="overflow-hidden bg-white/70">
          <button
            onClick={() => setShowLogs((s) => !s)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-semibold">Logs</span>
              {isRunning && (
                <Badge className="h-4 text-[9px] px-1.5 animate-pulse"
                  style={{ background: "rgba(114,9,183,0.15)", color: "#7209B7" }}>
                  live
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground">
                {status.logs?.length || 0} lignes
              </span>
            </div>
            {showLogs
              ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
              : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>

          <AnimatePresence>
            {showLogs && (
              <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                <div
                  ref={logsRef}
                  className="px-4 pb-3 border-t pt-3 max-h-72 overflow-y-auto space-y-0.5 bg-slate-950/95 rounded-b-xl">
                  {(status.logs || []).length === 0 ? (
                    <div className="text-[11px] font-mono text-slate-500 italic">En attente de logs…</div>
                  ) : (
                    (status.logs || []).map((entry, i) => (
                      <LogLine key={i} msg={entry.msg || entry} />
                    ))
                  )}
                  {isRunning && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                      <span className="text-[10px] font-mono text-violet-400">traitement en cours…</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      )}
    </div>
  );
}
