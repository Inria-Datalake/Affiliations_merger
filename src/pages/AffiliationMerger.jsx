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

function chunkArray(arr, size) { const chunks = []; for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size)); return chunks; }

async function analyzeBatch(batch) {
  const result = await invokeLLM({
    prompt: "Tu es un expert en analyse de donnees bibliometriques. Voici une liste d'affiliations extraites d'un fichier.\nAnalyse cette liste et identifie les groupes d'affiliations qui representent la MEME organisation mais ecrites differemment (variantes, abreviations, filiales, etc.).\n\nPour chaque groupe trouve :\n- Liste toutes les variantes (uniquement parmi les affiliations fournies)\n- Propose un nom fusionne (le plus standard/officiel possible)\n- Donne un score de confiance entre 0 et 1\n\nIMPORTANT :\n- Ne fusionne que si tu es CERTAIN que ce sont les memes organisations.\n- Ne regroupe PAS des organisations differentes qui collaborent souvent ensemble.\n- Ne cree pas de groupes avec une seule variante.\n- Sois conservateur : mieux vaut ne pas fusionner que mal fusionner.\n\nListe des affiliations :\n" + batch.join("\n"),
    response_json_schema: {
      type: "object",
      properties: { fusion_groups: { type: "array", items: { type: "object", properties: { variants: { type: "array", items: { type: "string" } }, merged_name: { type: "string" }, confidence: { type: "number" } }, required: ["variants", "merged_name", "confidence"] } } },
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
    if (existing) { const combined = new Set([...existing.variants.map((v) => v.trim()), ...group.variants.map((v) => v.trim())]); existing.variants = [...combined]; if (group.confidence > existing.confidence) { existing.merged_name = group.merged_name; existing.confidence = group.confidence; } }
    else { result.push({ ...group, variants: group.variants.map((v) => v.trim()) }); }
  }
  return result;
}

const STEP_IMPORT = 0;
const STEP_PREPROCESS = 0.5;
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
  const [preProcessData, setPreProcessData] = useState(null);
  const [pendingAffiliations, setPendingAffiliations] = useState([]);
  const [variantSplits, setVariantSplits] = useState({});
  const [rorIds, setRorIds] = useState({});

  const dictionary = useDictionary();

  const runIAAnalysis = useCallback(async (uniqueAffiliations, options = {}) => {
    const { useBatches = false } = options;
    const BATCH_SIZE = useBatches ? 50 : 100000;
    const batches = uniqueAffiliations.length > 0 ? chunkArray(uniqueAffiliations, BATCH_SIZE) : [];
    setProgress({ current: 0, total: batches.length });
    setStep(STEP_ANALYSIS);
    const iaGroups = [];
    for (let i = 0; i < batches.length; i++) { const batchGroups = await analyzeBatch(batches[i]); iaGroups.push(...batchGroups); setProgress({ current: i + 1, total: batches.length }); }
    return mergeGroups(iaGroups);
  }, []);

  const runFullAnalysis = useCallback(async (uniqueAffiliations, options = {}) => {
    const { knownGroups, unknownAffiliations } = dictionary.preProcess(uniqueAffiliations);
    const iaGroups = await runIAAnalysis(unknownAffiliations, options);
    const allGroups = [...knownGroups, ...iaGroups];
    setFusionGroups(allGroups);
    setAnalysisOptions(options);
    if (allGroups.length === 0) { setApprovedFusions([]); setStep(STEP_EXPORT); }
    else setStep(STEP_REVIEW);
  }, [dictionary, runIAAnalysis]);

  const handleFileProcessed = useCallback((uniqueAffiliations, rawData, selectedColumn, options) => {
    setAffiliations(uniqueAffiliations); setRawData(rawData); setSelectedColumn(selectedColumn); setFusionRound(1); setAnalysisOptions(options); setVariantSplits({}); setRorIds({});
    const { knownGroups, unknownAffiliations, exactDuplicates, multiOrgCandidates } = dictionary.preProcess(uniqueAffiliations);
    setPendingAffiliations(uniqueAffiliations);
    setPreProcessData({ exactDuplicates, multiOrgCandidates, knownFromDictionary: knownGroups.length, totalBefore: uniqueAffiliations.length, totalAfterDedup: uniqueAffiliations.length - exactDuplicates.length, options });
    if (exactDuplicates.length === 0 && multiOrgCandidates.length === 0 && knownGroups.length === 0) { runFullAnalysis(uniqueAffiliations, options); }
    else { setStep(STEP_PREPROCESS); }
  }, [dictionary, runFullAnalysis]);

  const handleSplitMultiOrg = useCallback((splitMap) => {
    const result = [];
    for (const aff of pendingAffiliations) { if (splitMap.has(aff)) { result.push(...splitMap.get(aff)); } else { result.push(aff); } }
    const unique = [...new Set(result.map((a) => a.trim()).filter(Boolean))];
    setAffiliations(unique); setPendingAffiliations(unique);
    runFullAnalysis(unique, preProcessData ? preProcessData.options : analysisOptions);
  }, [pendingAffiliations, preProcessData, analysisOptions, runFullAnalysis]);

  const handleSkipPreProcess = useCallback(() => { runFullAnalysis(pendingAffiliations, preProcessData ? preProcessData.options : analysisOptions); }, [pendingAffiliations, preProcessData, analysisOptions, runFullAnalysis]);

  const handleReanalyze = useCallback(async () => { if (affiliations.length === 0) return; setVariantSplits({}); setRorIds({}); await runFullAnalysis(affiliations, analysisOptions); }, [affiliations, analysisOptions, runFullAnalysis]);

  const handleReprocess = useCallback(async (enrichedData, fusedColumn, options) => {
    const newAffiliations = [...new Set(enrichedData.map((r) => String(r[fusedColumn] || "").trim()).filter(Boolean))];
    setRawData(enrichedData); setSelectedColumn(fusedColumn); setAffiliations(newAffiliations); setApprovedFusions([]); setFusionGroups([]); setVariantSplits({}); setRorIds({}); setFusionRound((r) => r + 1);
    await runFullAnalysis(newAffiliations, options || analysisOptions);
  }, [analysisOptions, runFullAnalysis]);

  const handleFusionComplete = useCallback((approved, splits = {}) => {
    setApprovedFusions(approved); setVariantSplits(splits);
    const rorMap = {};
    approved.forEach((group) => {
      const category = group.category || "Affiliations";
      const canonicalName = group.merged_name ? group.merged_name.trim() : "";
      const variants = group.variants ? group.variants.map((v) => v.trim()).filter(Boolean) : [];
      if (canonicalName && variants.length > 0) { dictionary.addEntries(category, variants, canonicalName); }
      if (group.ror_id) { rorMap[canonicalName] = group.ror_id; }
    });
    setRorIds(rorMap);
    for (const [original, parts] of Object.entries(splits)) { if (parts && parts.length > 1) { dictionary.addEntries("Affiliations", [original], parts[0]); } }
    setStep(STEP_EXPORT);
  }, [dictionary]);

  const handleRestart = useCallback(() => {
    setStep(STEP_IMPORT); setAffiliations([]); setFusionGroups([]); setApprovedFusions([]); setRawData([]); setSelectedColumn(null); setProgress({ current: 0, total: 0 }); setFusionRound(1); setPreProcessData(null); setPendingAffiliations([]); setVariantSplits({}); setRorIds({});
  }, []);

  const stepperStep = step === STEP_PREPROCESS ? 0 : step;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #F0F7FF 0%, #E0F2FE 40%, #F0FDFA 100%)" }}>
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-4">
          <img src="https://raw.githubusercontent.com/Inria-Datalake/Copublications/refs/heads/main/dashboard/assets/logo_inria.png" alt="Inria" className="h-10 w-auto object-contain"
            onError={(e) => { const img = e.currentTarget; img.style.display = "none"; const fb = img.nextSibling; if (fb) fb.style.display = "flex"; }} />
          <div style={{ display: "none" }} className="items-center gap-1">
            <div className="w-8 h-8 rounded-xl bg-[#E3051B] flex items-center justify-center text-white font-black text-lg">i</div>
            <span className="font-black text-xl tracking-tight">nria</span>
          </div>
          <div className="flex items-center gap-2 ml-4 flex-1">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center"><GitMerge className="w-4 h-4 text-primary-foreground" /></div>
            <div>
              <h1 className="text-base font-bold tracking-tight leading-tight">Affiliation Merger</h1>
              <p className="text-[11px] text-muted-foreground leading-none">
                Fusionnez les affiliations similaires grâce à l'IA
                {fusionRound > 1 && <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "rgba(37,99,235,0.1)", color: "#2563EB" }}>Tour {fusionRound}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dictionary.totalEntries > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: "rgba(37,99,235,0.08)", color: "#2563EB" }}>
                <span>BOOK</span><span>{dictionary.totalEntries} entrées</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Stepper currentStep={stepperStep} />
        {step === STEP_IMPORT && <FileUpload onFileProcessed={handleFileProcessed} dictionaryProps={dictionary} />}
        {step === STEP_PREPROCESS && preProcessData && (
          <div className="space-y-4">
            <PreProcessReport exactDuplicates={preProcessData.exactDuplicates} multiOrgCandidates={preProcessData.multiOrgCandidates} knownFromDictionary={preProcessData.knownFromDictionary} totalBefore={preProcessData.totalBefore} totalAfterDedup={preProcessData.totalAfterDedup} onSplitMultiOrg={preProcessData.multiOrgCandidates.length > 0 ? handleSplitMultiOrg : null} onSkip={handleSkipPreProcess} />
            {preProcessData.multiOrgCandidates.length === 0 && (
              <button onClick={handleSkipPreProcess} className="w-full py-3 rounded-xl text-white text-sm font-medium transition-opacity hover:opacity-90 shadow-sm" style={{ background: "#2563EB" }}>Continuer vers l'analyse →</button>
            )}
          </div>
        )}
        {step === STEP_ANALYSIS && <AnalysisLoader progress={progress} />}
        {step === STEP_REVIEW && <FusionReview groups={fusionGroups} onComplete={handleFusionComplete} onReanalyze={handleReanalyze} initialMinConfidence={analysisOptions.minConfidence} dictionaryProps={dictionary} rawData={rawData} selectedColumn={selectedColumn} />}
        {step === STEP_EXPORT && <ExportResult approvedFusions={approvedFusions} originalAffiliations={affiliations} rawData={rawData} selectedColumn={selectedColumn} onRestart={handleRestart} onReprocess={handleReprocess} analysisOptions={analysisOptions} variantSplits={variantSplits} rorIds={rorIds} />}
      </main>

      <footer className="border-t bg-white/60 backdrop-blur-sm mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center">
          <p className="text-xs text-muted-foreground">
            Créé par <span className="font-semibold" style={{ color: "#2563EB" }}>Andréa NEBOT</span> — Groupe <span className="font-semibold" style={{ color: "#2563EB" }}>DATALAKE</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
