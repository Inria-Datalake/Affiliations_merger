import React from "react";
import { motion } from "framer-motion";
import { Brain } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function AnalysisLoader({ progress = { current: 0, total: 0 } }) {
  const { current, total } = progress;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const hasStarted = total > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="p-12 flex flex-col items-center gap-6 bg-card/50 backdrop-blur-sm">
        {/* Icône animée */}
        <div className="relative">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #7209B7, #F72585)" }}
          >
            <Brain className="w-10 h-10 text-white" />
          </div>
          <div
            className="absolute inset-0 w-20 h-20 rounded-2xl animate-ping"
            style={{ border: "2px solid #7209B7", opacity: 0.4 }}
          />
        </div>

        {/* Texte */}
        <div className="text-center space-y-1 w-full max-w-sm">
          <h3 className="text-lg font-semibold text-foreground">
            Analyse en cours...
          </h3>
          <p className="text-sm text-muted-foreground">
            {hasStarted
              ? `Lot ${current} sur ${total} traité${current > 1 ? "s" : ""}`
              : "Préparation de l'analyse..."}
          </p>
        </div>

        {/* Barre de progression */}
        {hasStarted && (
          <div className="w-full max-w-sm space-y-2">
            <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, #7209B7, #4CC9F0)" }}
                initial={{ width: "0%" }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{percent}%</span>
              <span>{current} / {total} lots</span>
            </div>
          </div>
        )}

        {/* Points animés */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              style={{ background: ["#F72585", "#7209B7", "#4CC9F0"][i] }}
              className="w-2.5 h-2.5 rounded-full"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.3 }}
            />
          ))}
        </div>

        {/* Estimation */}
        {hasStarted && total > 1 && (
          <p className="text-xs text-muted-foreground text-center">
            ⏱ Environ {Math.ceil((total - current) * 8)} secondes restantes
          </p>
        )}
      </Card>
    </motion.div>
  );
}