import React from "react";
import { motion } from "framer-motion";
import { Brain } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function AnalysisLoader({ progress = { current: 0, total: 0 } }) {
  const { current, total } = progress;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const hasStarted = total > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Card className="p-12 flex flex-col items-center gap-6 bg-card border shadow-sm rounded-3xl">
        <div className="relative">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-md" style={{ background: "#2563EB" }}>
            <Brain className="w-10 h-10 text-white" />
          </div>
          <div className="absolute inset-0 w-20 h-20 rounded-3xl animate-ping" style={{ border: "2px solid #2563EB", opacity: 0.3 }} />
        </div>
        <div className="text-center space-y-1 w-full max-w-sm">
          <h3 className="text-lg font-semibold text-foreground">Analyse en cours...</h3>
          <p className="text-sm text-muted-foreground">
            {hasStarted ? `Lot ${current} sur ${total} traité${current > 1 ? "s" : ""}` : "Préparation de l'analyse..."}
          </p>
        </div>
        {hasStarted && (
          <div className="w-full max-w-sm space-y-2">
            <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
              <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, #2563EB, #60A5FA)" }}
                initial={{ width: "0%" }} animate={{ width: `${percent}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{percent}%</span><span>{current} / {total} lots</span>
            </div>
          </div>
        )}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div key={i} style={{ background: "#2563EB" }} className="w-2.5 h-2.5 rounded-full"
              animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.3 }} />
          ))}
        </div>
        {hasStarted && total > 1 && (
          <p className="text-xs text-muted-foreground text-center">Environ {Math.ceil((total - current) * 8)} secondes restantes</p>
        )}
      </Card>
    </motion.div>
  );
}
