import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, X, Pencil, ArrowRight, GitMerge } from "lucide-react";
import { cn } from "@/lib/utils";

export default function FusionStep({
  group,
  groupIndex,
  totalGroups,
  onApprove,
  onReject,
}) {
  const [mergedName, setMergedName] = useState(group.merged_name);
  const [editing, setEditing] = useState(false);

  return (
    <motion.div
      key={groupIndex}
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.35 }}
    >
      <Card className="p-6 bg-card/50 backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background: "linear-gradient(135deg, #7209B7, #F72585)"}}>
              <GitMerge className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                Groupe de fusion {groupIndex + 1}/{totalGroups}
              </h3>
              <p className="text-xs text-muted-foreground">
                {group.variants.length} variantes détectées
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">
            {Math.round(group.confidence * 100)}% de confiance
          </Badge>
        </div>

        {/* Variants */}
        <div className="space-y-2 mb-6">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Variantes trouvées
          </p>
          <div className="flex flex-wrap gap-2">
            {group.variants.map((variant, i) => (
              <Badge
                key={i}
                variant="outline"
                className="px-3 py-1.5 text-sm font-normal bg-muted/50"
              >
                {variant}
              </Badge>
            ))}
          </div>
        </div>

        {/* Merged name */}
        <div className="p-4 rounded-xl mb-6" style={{background: "linear-gradient(135deg, rgba(114,9,183,0.06), rgba(76,201,240,0.08))", border: "1px solid rgba(114,9,183,0.15)"}}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Nom fusionné proposé
          </p>
          <div className="flex items-center gap-3">
            <ArrowRight className="w-4 h-4 shrink-0" style={{color: "#7209B7"}} />
            {editing ? (
              <Input
                value={mergedName}
                onChange={(e) => setMergedName(e.target.value)}
                onBlur={() => setEditing(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
                autoFocus
                className="text-lg font-semibold"
              />
            ) : (
              <div className="flex items-center gap-2 flex-1">
                <span className="text-lg font-semibold text-foreground">
                  {mergedName}
                </span>
                <button
                  onClick={() => setEditing(true)}
                  className="p-1 rounded-md hover:bg-muted transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onReject(groupIndex)}
          >
            <X className="w-4 h-4 mr-2" />
            Rejeter
          </Button>
          <Button
            className="flex-1 text-white border-0"
            style={{background: "linear-gradient(135deg, #7209B7, #F72585)"}}
            onClick={() => onApprove(groupIndex, mergedName)}
          >
            <Check className="w-4 h-4 mr-2" />
            Valider cette fusion
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}