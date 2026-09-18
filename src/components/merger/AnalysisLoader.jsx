import React from "react";
import { motion } from "framer-motion";
import { Brain, AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function AnalysisLoader({
  progress = { current: 0, total: 0 },
  error = null,
  onRetry = null,
  onRestart = null,
}) {
  const { current, total } = progress;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const hasStarted = total > 0;

  // ── Écran d'erreur : on affiche le problème + les solutions ──
  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-2xl mx-auto mt-16"
      >
        <Card className="p-8 border-amber-200 shadow-md">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "#FEF3C7" }}>
              <AlertTriangle className="w-8 h-8" style={{ color: "#D97706" }} />
            </div>

            <div>
              <h2 className="text-xl font-bold mb-2">L'analyse a échoué</h2>
              <p className="text-sm rounded-xl px-4 py-3 break-words" style={{ background: "#F8FAFC", color: "#334155", fontFamily: "monospace", fontSize: "12px" }}>
                {error}
              </p>
            </div>

            <div className="w-full rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-left">
              <p className="text-xs font-semibold text-primary mb-2">💡 Solutions possibles :</p>
              <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                <li>Vérifiez que <code className="font-mono">VITE_MISTRAL_API_KEY</code> est bien défini dans <code className="font-mono">.env.local</code> (à la racine du projet)</li>
                <li>Relancez l'app après modification : <code className="font-mono">Ctrl+C</code> puis <code className="font-mono">npm run start</code></li>
                <li>Si votre fichier contient beaucoup de lignes, utilisez le mode <strong>« Par lots de 50 »</strong> à l'import</li>
                <li>Vérifiez votre connexion internet et le solde de votre compte <a href="https://console.mistral.ai" target="_blank" rel="noreferrer" className="text-primary underline">console.mistral.ai</a></li>
              </ul>
            </div>

            <div className="flex gap-3 mt-2">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium shadow-sm transition-opacity hover:opacity-90"
                  style={{ background: "#2563EB" }}
                >
                  <RotateCcw className="w-4 h-4" />
                  Réessayer l'analyse
                </button>
              )}
              {onRestart && (
                <button
                  onClick={onRestart}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-input bg-white text-sm font-medium shadow-sm transition-colors hover:bg-muted/40"
                >
                  <Home className="w-4 h-4" />
                  Recommencer
                </button>
              )}
            </div>
          </div>
        </Card>
      </motion.div>
    );
  }

  // ── Écran de chargement normal ──
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl mx-auto mt-16"
    >
      <Card className="p-8 shadow-md">
        <div className="flex flex-col items-center text-center gap-4">
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-md"
            style={{ background: "linear-gradient(135deg, #2563EB 0%, #60A5FA 100%)" }}
          >
            <Brain className="w-10 h-10 text-white" />
          </motion.div>

          <div>
            <h2 className="text-xl font-bold">Analyse en cours...</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {hasStarted
                ? `Lot ${current} sur ${total} traité${current > 1 ? "s" : ""}`
                : "Préparation de la requête vers Mistral AI"}
            </p>
          </div>

          {/* Barre de progression */}
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "#E0F2FE" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg, #2563EB, #60A5FA)" }}
              initial={{ width: "0%" }}
              animate={{ width: `${hasStarted ? Math.max(percent, 4) : 100}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>

          {hasStarted && (
            <p className="text-xs text-muted-foreground">
              {percent}% · L'IA peut prendre 1 à 3 minutes par lot, merci de patienter
            </p>
          )}
          {!hasStarted && (
            <p className="text-xs text-muted-foreground">
              Connexion à l'API Mistral en cours...
            </p>
          )}
        </div>
      </Card>
    </motion.div>
  );
}