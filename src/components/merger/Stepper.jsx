import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  { label: "Import", description: "Charger le fichier" },
  { label: "Analyse", description: "Détection par IA" },
  { label: "Validation", description: "Valider les fusions" },
  { label: "Export", description: "Télécharger le résultat" },
];

export default function Stepper({ currentStep }) {
  return (
    <div className="flex items-center justify-center gap-0 w-full max-w-2xl mx-auto mb-10">
      {steps.map((step, index) => (
        <React.Fragment key={index}>
          <div className="flex flex-col items-center gap-2">
            <div
              style={index <= currentStep ? {
              background: index === currentStep
                ? "linear-gradient(135deg, #7209B7, #F72585)"
                : "linear-gradient(135deg, #7209B7, #4361EE)",
              boxShadow: index === currentStep ? "0 4px 15px rgba(114,9,183,0.4)" : "none"
            } : {}}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300",
              index < currentStep
                ? "text-white ring-0"
                : index === currentStep
                ? "text-white ring-4 ring-purple-200"
                : "bg-muted text-muted-foreground"
            )}
            >
              {index < currentStep ? (
                <Check className="w-5 h-5" />
              ) : (
                index + 1
              )}
            </div>
            <div className="text-center">
              <p
                className={cn(
                  "text-xs font-medium transition-colors",
                  index <= currentStep ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
              </p>
              <p className="text-[10px] text-muted-foreground hidden sm:block">
                {step.description}
              </p>
            </div>
          </div>
          {index < steps.length - 1 && (
            <div
              style={index < currentStep ? {background: "linear-gradient(90deg, #7209B7, #4361EE)"} : {}}
            className={cn(
              "h-[2px] flex-1 mx-2 mt-[-20px] transition-colors duration-300",
              index < currentStep ? "" : "bg-border"
            )}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}