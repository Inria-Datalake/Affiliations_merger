import React, { useState, useCallback } from "react";
import { invokeLLM } from "@/api/llmClient";
import { GitMerge } from "lucide-react";
import Stepper from "../components/merger/Stepper";
import FileUpload from "../components/merger/FileUpload";
import AnalysisLoader from "../components/merger/AnalysisLoader";
import FusionReview from "../components/merger/FusionReview";
import ExportResult from "../components/merger/ExportResult";
import PreProcessReport from "../components/merger/PreProcessReport";
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
      if (group.confidence > existing.confidence) {
        existing.merged_name = group.merged_name;
        existing.confidence = group.confidence;
      }
    } else {
      result.push({ ...group, variants: group.variants.map((v) => v.trim()) });
    }
  }
  return result;
}

// Étape intermédiaire entre Import et Analyse
const STEP_IMPORT = 0;
const STEP_PREPROCESS = 0.5; // étape virtuelle (même stepper visuel que 0)
const STEP_ANALYSIS = 1;
const STEP_REVIEW = 2;
const STEP_EXPORT = 3;

export default function AffiliationMerger() {
  const [step, setStep] = useState(STEP_IMPORT);
  const [affiliations, setAffiliations] = useState([]);
  const [fusionGroups, setFusionGroups] = useState([]);
  const [approvedFusions, setApprovedFusions] = useState([]);
  const [rawData, setRawData] = useState([]);
  const [selectedColumn, setSelectedColumn] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [analysisOptions, setAnalysisOptions] = useState({ useBatches: false, minConfidence: 50 });
  const [fusionRound, setFusionRound] = useState(1);

  // Rapport de pré-traitement
  const [preProcessData, setPreProcessData] = useState(null);
  // Affiliations après éventuelle scission multi-org
  const [pendingAffiliations, setPendingAffiliations] = useState([]);

  const dictionary = useDictionary();

  // ── Lancement de l'analyse IA ────────────────────────────────
  const runIAAnalysis = useCallback(async (uniqueAffiliations, options = {}) => {
    const { useBatches = false } = options;
    const BATCH_SIZE = useBatches ? 50 : 100000;
    const batches = uniqueAffiliations.length > 0 ? chunkArray(uniqueAffiliations, BATCH_SIZE) : [];

    setProgress({ current: 0, total: batches.length });
    setStep(STEP_ANALYSIS);

    const iaGroups = [];
    for (let i = 0; i < batches.length; i++) {
      const batchGroups = await analyzeBatch(batches[i]);
      iaGroups.push(...batchGroups);
      setProgress({ current: i + 1, total: batches.length });
    }

    return mergeGroups(iaGroups);
  }, []);

  // ── Orchestration complète ───────────────────────────────────
  const runFullAnalysis = useCallback(async (uniqueAffiliations, options = {}) => {
    const { knownGroups, unknownAffiliations } = dictionary.preProcess(uniqueAffiliations);
    const iaGroups = await runIAAnalysis(unknownAffiliations, options);
    const allGroups = [...knownGroups, ...iaGroups];
    setFusionGroups(allGroups);
    setAnalysisOptions(options);
    if (allGroups.length === 0) { setApprovedFusions([]); setStep(STEP_EXPORT); }
    else setStep(STEP_REVIEW);
  }, [dictionary, runIAAnalysis]);

  // ── Étape 1 : fichier importé → pré-traitement ───────────────
  const handleFileProcessed = useCallback((uniqueAffiliations, rawData, selectedColumn, options) => {
    setAffiliations(uniqueAffiliations);
    setRawData(rawData);
    setSelectedColumn(selectedColumn);
    setFusionRound(1);
    setAnalysisOptions(options);

    // Pré-traitement
    const { knownGroups, unknownAffiliations, exactDuplicates, multiOrgCandidates } =
      dictionary.preProcess(uniqueAffiliations);

    setPendingAffiliations(uniqueAffiliations);
    setPreProcessData({
      exactDuplicates,
      multiOrgCandidates,
      knownFromDictionary: knownGroups.length,
      totalBefore: uniqueAffiliations.length,
      totalAfterDedup: uniqueAffiliations.length - exactDuplicates.length,
      options,
    });

    // Si rien à signaler, lancer directement l'analyse
    if (exactDuplicates.length === 0 && multiOrgCandidates.length === 0 && knownGroups.length === 0) {
      runFullAnalysis(uniqueAffiliations, options);
    } else {
      setStep(STEP_PREPROCESS);
    }
  }, [dictionary, runFullAnalysis]);

  // ── Scission multi-organismes ────────────────────────────────
  const handleSplitMultiOrg = useCallback((splitMap) => {
    // Remplacer les affiliations multi-org par leurs parties
    const result = [];
    for (const aff of pendingAffiliations) {
      if (splitMap.has(aff)) {
        result.push(...splitMap.get(aff));
      } else {
        result.push(aff);
      }
    }
    const unique = [...new Set(result.map((a) => a.trim()).filter(Boolean))];
    setAffiliations(unique);
    setPendingAffiliations(unique);
    runFullAnalysis(unique, preProcessData?.options || analysisOptions);
  }, [pendingAffiliations, preProcessData, analysisOptions, runFullAnalysis]);

  // ── Ignorer le rapport et lancer directement ─────────────────
  const handleSkipPreProcess = useCallback(() => {
    runFullAnalysis(pendingAffiliations, preProcessData?.options || analysisOptions);
  }, [pendingAffiliations, preProcessData, analysisOptions, runFullAnalysis]);

  // ── Ré-analyse ────────────────────────────────────────────────
  const handleReanalyze = useCallback(async () => {
    if (affiliations.length === 0) return;
    await runFullAnalysis(affiliations, analysisOptions);
  }, [affiliations, analysisOptions, runFullAnalysis]);

  // ── Retraitement depuis Export ────────────────────────────────
  const handleReprocess = useCallback(async (enrichedData, fusedColumn, options) => {
    const newAffiliations = [...new Set(
      enrichedData.map((r) => String(r[fusedColumn] || "").trim()).filter(Boolean)
    )];
    setRawData(enrichedData);
    setSelectedColumn(fusedColumn);
    setAffiliations(newAffiliations);
    setApprovedFusions([]);
    setFusionGroups([]);
    setFusionRound((r) => r + 1);
    await runFullAnalysis(newAffiliations, options || analysisOptions);
  }, [analysisOptions, runFullAnalysis]);

  const handleFusionComplete = useCallback((approved) => {
    setApprovedFusions(approved);

    // ── Ajout automatique au dictionnaire ────────────────────────
    // Pour chaque fusion validée, on enregistre toutes les variantes
    // → catégorie "Affiliations" par défaut (ou celle choisie dans FusionReview)
    approved.forEach((group) => {
      const category = group.category || "Affiliations";
      const canonicalName = group.merged_name?.trim();
      const variants = group.variants?.map((v) => v.trim()).filter(Boolean);
      if (canonicalName && variants?.length > 0) {
        dictionary.addEntries(category, variants, canonicalName);
      }
    });

    setStep(STEP_EXPORT);
  }, [dictionary]);

  const handleRestart = useCallback(() => {
    setStep(STEP_IMPORT);
    setAffiliations([]); setFusionGroups([]); setApprovedFusions([]);
    setRawData([]); setSelectedColumn(null);
    setProgress({ current: 0, total: 0 });
    setFusionRound(1); setPreProcessData(null); setPendingAffiliations([]);
  }, []);

  // Stepper visuel : l'étape PREPROCESS s'affiche comme étape 0
  const stepperStep = step === STEP_PREPROCESS ? 0 : step;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #F8F9FF 0%, #f0e8ff 40%, #e8f4ff 100%)" }}>
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-4">
          <img
            src="https://raw.githubusercontent.com/Inria-Datalake/Copublications/refs/heads/main/dashboard/assets/logo_inria.png"
            alt="Inria" className="h-10 w-auto object-contain"
            onError={(e) => {
              const img = e.currentTarget;
              img.style.display = "none";
              const fallback = img.nextSibling;
              if (fallback) fallback.style.display = "flex";
            }}
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
              <p className="text-[11px] text-muted-foreground leading-none">
                Fusionnez les affiliations similaires grâce à l'IA
                {fusionRound > 1 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ background: "rgba(114,9,183,0.1)", color: "#7209B7" }}>
                    Tour {fusionRound}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dictionary.totalEntries > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ background: "rgba(5,150,105,0.1)", color: "#059669" }}>
                <span>📚</span>
                <span>{dictionary.totalEntries} entrées</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <Stepper currentStep={stepperStep} />

        {/* Étape 0 : Import */}
        {step === STEP_IMPORT && (
          <FileUpload onFileProcessed={handleFileProcessed} dictionaryProps={dictionary} />
        )}

        {/* Étape 0.5 : Rapport pré-traitement */}
        {step === STEP_PREPROCESS && preProcessData && (
          <div className="space-y-4">
            <PreProcessReport
              exactDuplicates={preProcessData.exactDuplicates}
              multiOrgCandidates={preProcessData.multiOrgCandidates}
              knownFromDictionary={preProcessData.knownFromDictionary}
              totalBefore={preProcessData.totalBefore}
              totalAfterDedup={preProcessData.totalAfterDedup}
              onSplitMultiOrg={preProcessData.multiOrgCandidates.length > 0 ? handleSplitMultiOrg : null}
              onSkip={handleSkipPreProcess}
            />
            {/* Bouton continuer si pas de multi-org à scinder */}
            {preProcessData.multiOrgCandidates.length === 0 && (
              <button
                onClick={handleSkipPreProcess}
                className="w-full py-3 rounded-xl text-white text-sm font-medium transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #7209B7, #4CC9F0)" }}>
                Continuer vers l'analyse →
              </button>
            )}
          </div>
        )}

        {/* Étape 1 : Analyse IA */}
        {step === STEP_ANALYSIS && <AnalysisLoader progress={progress} />}

        {/* Étape 2 : Validation */}
        {step === STEP_REVIEW && (
          <FusionReview
            groups={fusionGroups}
            onComplete={handleFusionComplete}
            onReanalyze={handleReanalyze}
            initialMinConfidence={analysisOptions.minConfidence}
            dictionaryProps={dictionary}
          />
        )}

        {/* Étape 3 : Export */}
        {step === STEP_EXPORT && (
          <ExportResult
            approvedFusions={approvedFusions}
            originalAffiliations={affiliations}
            rawData={rawData}
            selectedColumn={selectedColumn}
            onRestart={handleRestart}
            onReprocess={handleReprocess}
            analysisOptions={analysisOptions}
          />
        )}
      </main>
    </div>
  );
}