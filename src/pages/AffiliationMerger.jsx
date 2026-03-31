import React, { useState, useCallback } from "react";
import { invokeLLM } from "@/api/llmClient";
import { GitMerge } from "lucide-react";
import Stepper from "../components/merger/Stepper";
import FileUpload from "../components/merger/FileUpload";
import AnalysisLoader from "../components/merger/AnalysisLoader";
import FusionReview from "../components/merger/FusionReview";
import ExportResult from "../components/merger/ExportResult";
import { useDictionary } from "../hooks/useDictionary";

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function analyzeBatch(batch) {
  const result = await invokeLLM({
    prompt: `Tu es un expert en analyse de données bibliométriques. Voici une liste d'affiliations extraites d'un fichier.
Analyse cette liste et identifie les groupes d'affiliations qui représentent la MÊME organisation mais écrites différemment (variantes, abréviations, filiales, etc.).

Pour chaque groupe trouvé :
- Liste toutes les variantes (uniquement parmi les affiliations fournies)
- Propose un nom fusionné (le plus standard/officiel possible)
- Donne un score de confiance entre 0 et 1

IMPORTANT :
- Ne fusionne que si tu es CERTAIN que ce sont les mêmes organisations.
- Ne regroupe PAS des organisations différentes qui collaborent souvent ensemble.
- Ne crée pas de groupes avec une seule variante.
- Sois conservateur : mieux vaut ne pas fusionner que mal fusionner.

Liste des affiliations :
${batch.join("\n")}`,
    response_json_schema: {
      type: "object",
      properties: {
        fusion_groups: {
          type: "array",
          items: {
            type: "object",
            properties: {
              variants: { type: "array", items: { type: "string" } },
              merged_name: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["variants", "merged_name", "confidence"],
          },
        },
      },
      required: ["fusion_groups"],
    },
  });
  return result.fusion_groups || [];
}

function mergeGroups(groups) {
  const result = [];
  for (const group of groups) {
    const variantSet = new Set(group.variants.map((v) => v.trim().toLowerCase()));
    const existing = result.find((g) => g.variants.some((v) => variantSet.has(v.trim().toLowerCase())));
    if (existing) {
      const combined = new Set([...existing.variants.map((v) => v.trim()), ...group.variants.map((v) => v.trim())]);
      existing.variants = [...combined];
      if (group.confidence > existing.confidence) { existing.merged_name = group.merged_name; existing.confidence = group.confidence; }
    } else {
      result.push({ ...group, variants: group.variants.map((v) => v.trim()) });
    }
  }
  return result;
}

export default function AffiliationMerger() {
  const [step, setStep] = useState(0);
  const [affiliations, setAffiliations] = useState([]);
  const [fusionGroups, setFusionGroups] = useState([]);
  const [approvedFusions, setApprovedFusions] = useState([]);
  const [rawData, setRawData] = useState([]);
  const [selectedColumn, setSelectedColumn] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [analysisOptions, setAnalysisOptions] = useState({ useBatches: false, minConfidence: 50 });

  const dictionary = useDictionary();

  const runAnalysis = useCallback(async (uniqueAffiliations, options = {}) => {
    const { useBatches = false, minConfidence = 0 } = options;

    // ── Étape 1 : pré-remplir depuis le dictionnaire ──────────────
    const { knownGroups, unknownAffiliations } = dictionary.preProcess(uniqueAffiliations);

    // ── Étape 2 : envoyer les inconnues à l'IA ────────────────────
    const BATCH_SIZE = useBatches ? 50 : 100000;
    const batches = unknownAffiliations.length > 0 ? chunkArray(unknownAffiliations, BATCH_SIZE) : [];

    setProgress({ current: 0, total: batches.length + (knownGroups.length > 0 ? 1 : 0) });
    setStep(1);

    const iaGroups = [];
    for (let i = 0; i < batches.length; i++) {
      const batchGroups = await analyzeBatch(batches[i]);
      iaGroups.push(...batchGroups);
      setProgress({ current: i + 1, total: batches.length });
    }

    const mergedIa = mergeGroups(iaGroups);

    // ── Étape 3 : combiner dictionnaire + IA ──────────────────────
    // Les groupes du dictionnaire viennent EN PREMIER
    const allGroups = [...knownGroups, ...mergedIa];

    setFusionGroups(allGroups);
    setAnalysisOptions({ useBatches, minConfidence });

    if (allGroups.length === 0) {
      setApprovedFusions([]);
      setStep(3);
    } else {
      setStep(2);
    }
  }, [dictionary]);

  const handleFileProcessed = useCallback(async (uniqueAffiliations, rawData, selectedColumn, options) => {
    setAffiliations(uniqueAffiliations);
    setRawData(rawData);
    setSelectedColumn(selectedColumn);
    await runAnalysis(uniqueAffiliations, options);
  }, [runAnalysis]);

  const handleReanalyze = useCallback(async () => {
    if (affiliations.length === 0) return;
    await runAnalysis(affiliations, analysisOptions);
  }, [affiliations, analysisOptions, runAnalysis]);

  const handleFusionComplete = useCallback((approved) => {
    setApprovedFusions(approved);
    setStep(3);
  }, []);

  const handleRestart = useCallback(() => {
    setStep(0);
    setAffiliations([]); setFusionGroups([]); setApprovedFusions([]);
    setRawData([]); setSelectedColumn(null);
    setProgress({ current: 0, total: 0 });
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #F8F9FF 0%, #f0e8ff 40%, #e8f4ff 100%)" }}>
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-4">
          <img
            src="https://raw.githubusercontent.com/Inria-Datalake/Copublications/refs/heads/main/dashboard/assets/logo_inria.png"
            alt="Inria" className="h-10 w-auto object-contain"
            onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
          />
          <div style={{ display: "none" }} className="items-center gap-1">
            <div className="w-8 h-8 rounded bg-[#E3051B] flex items-center justify-center text-white font-black text-lg">i</div>
            <span className="font-black text-xl tracking-tight">nria</span>
          </div>
          <div className="flex items-center gap-2 ml-4 flex-1">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <GitMerge className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight leading-tight">Affiliation Merger</h1>
              <p className="text-[11px] text-muted-foreground leading-none">Fusionnez les affiliations similaires grâce à l'IA</p>
            </div>
          </div>
          {dictionary.totalEntries > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: "rgba(5,150,105,0.1)", color: "#059669" }}>
              <span>📚</span>
              <span>{dictionary.totalEntries} entrées</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <Stepper currentStep={step} />

        {step === 0 && (
          <FileUpload
            onFileProcessed={handleFileProcessed}
            dictionaryProps={dictionary}
          />
        )}
        {step === 1 && <AnalysisLoader progress={progress} />}
        {step === 2 && (
          <FusionReview
            groups={fusionGroups}
            onComplete={handleFusionComplete}
            onReanalyze={handleReanalyze}
            initialMinConfidence={analysisOptions.minConfidence}
            dictionaryProps={dictionary}
          />
        )}
        {step === 3 && (
          <ExportResult
            approvedFusions={approvedFusions}
            originalAffiliations={affiliations}
            rawData={rawData}
            selectedColumn={selectedColumn}
            onRestart={handleRestart}
          />
        )}
      </main>
    </div>
  );
}