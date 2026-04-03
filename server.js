/**
 * server.js
 * Serveur Express exposant :
 *   GET  /api/dictionary          → lit dictionary.json
 *   POST /api/dictionary          → écrit dictionary.json
 *   POST /api/pipeline/run        → lance affiliation_merger.py
 *   GET  /api/pipeline/status     → état du pipeline en cours
 *   POST /api/fuzzy/match         → fuzzy matching à la volée (sans pipeline complet)
 *   GET  /api/fuzzy/dependencies  → vérifie les dépendances Python
 *
 * Lancement : node server.js
 */

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, execFile } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

const DICT_PATH     = path.join(__dirname, "dictionary.json");
const OUTPUTS_DIR   = path.join(__dirname, "outputs");
const PYTHON_SCRIPT = path.join(__dirname, "affiliation_merger.py");

// Détection automatique de l'exécutable Python dans le venv
const VENV_PYTHON = (() => {
  const candidates = [
    path.join(__dirname, ".venv", "Scripts", "python.exe"),  // Windows
    path.join(__dirname, ".venv", "bin", "python"),           // Unix
    "python",                                                  // fallback global
  ];
  return candidates.find((p) => {
    try { fs.accessSync(p); return true; } catch { return false; }
  }) || "python";
})();

// État global du pipeline (1 pipeline à la fois)
let pipelineState = {
  running: false,
  pid: null,
  startedAt: null,
  logs: [],
  exitCode: null,
  outputFile: null,
  error: null,
};

if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "50mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── GET /api/dictionary ────────────────────────────────────────────────────
app.get("/api/dictionary", (req, res) => {
  if (!fs.existsSync(DICT_PATH)) return res.json(null);
  try {
    const data = JSON.parse(fs.readFileSync(DICT_PATH, "utf-8"));
    res.json(data);
  } catch (err) {
    console.error("Erreur lecture dictionary.json :", err);
    res.status(500).json({ error: "Erreur de lecture" });
  }
});

// ── POST /api/dictionary ───────────────────────────────────────────────────
app.post("/api/dictionary", (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.categories) return res.status(400).json({ error: "Format invalide" });
    fs.writeFileSync(DICT_PATH, JSON.stringify(data, null, 2), "utf-8");
    const n = Object.values(data.categories).reduce((s, c) => s + Object.keys(c).length, 0);
    console.log(`✅ Dictionnaire sauvegardé (${n} entrées)`);
    res.json({ ok: true, entries: n });
  } catch (err) {
    console.error("Erreur écriture dictionary.json :", err);
    res.status(500).json({ error: "Erreur d'écriture" });
  }
});

// ── GET /api/pipeline/status ───────────────────────────────────────────────
app.get("/api/pipeline/status", (req, res) => {
  res.json({ ...pipelineState });
});

// ── POST /api/pipeline/run ─────────────────────────────────────────────────
/**
 * Body attendu :
 * {
 *   inputFile    : string  — nom du fichier dans outputs/ (ex: "affil_normalize.xlsx")
 *   outputFile   : string  — nom du fichier de sortie (ex: "result.xlsx")
 *   threshold    : number  — seuil fuzzy 0–1 (défaut 0.82)
 *   useFuzzy     : boolean — activer fuzzy matching
 *   useSbert     : boolean — activer SBERT
 *   applyFilter  : boolean — filtrage primary/dept
 *   saveFailed   : boolean — exporter les non-résolus
 * }
 */
app.post("/api/pipeline/run", (req, res) => {
  if (pipelineState.running) {
    return res.status(409).json({ error: "Un pipeline est déjà en cours", pid: pipelineState.pid });
  }

  const {
    inputFile,
    outputFile  = "affiliation_merged.xlsx",
    threshold   = 0.82,
    useFuzzy    = true,
    useSbert    = true,
    applyFilter = true,
    saveFailed  = true,
  } = req.body;

  if (!inputFile) return res.status(400).json({ error: "inputFile requis" });

  const inputPath  = path.join(OUTPUTS_DIR, inputFile);
  const outputPath = path.join(OUTPUTS_DIR, outputFile);

  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ error: `Fichier introuvable : ${inputPath}` });
  }

  const args = [
    PYTHON_SCRIPT,
    "--input",  inputPath,
    "--output", outputPath,
    "--dict",   DICT_PATH,
    "--threshold", String(threshold),
  ];
  if (!useFuzzy)    args.push("--no-fuzzy");
  if (!useSbert)    args.push("--no-sbert");
  if (!applyFilter) args.push("--no-filter");
  if (!saveFailed)  args.push("--no-failed");

  // Reset état
  pipelineState = {
    running: true,
    pid: null,
    startedAt: new Date().toISOString(),
    logs: [],
    exitCode: null,
    outputFile: outputFile,
    error: null,
  };

  const proc = spawn(VENV_PYTHON, args, { cwd: __dirname });
  pipelineState.pid = proc.pid;

  const addLog = (line) => {
    const entry = { ts: new Date().toISOString(), msg: line.trim() };
    pipelineState.logs.push(entry);
    console.log(`[pipeline] ${entry.msg}`);
  };

  proc.stdout.on("data", (d) => d.toString().split("\n").filter(Boolean).forEach(addLog));
  proc.stderr.on("data", (d) => d.toString().split("\n").filter(Boolean).forEach(addLog));

  proc.on("close", (code) => {
    pipelineState.running  = false;
    pipelineState.exitCode = code;
    if (code !== 0) pipelineState.error = `Le processus s'est terminé avec le code ${code}`;
    console.log(`[pipeline] Terminé — code ${code}`);
  });

  proc.on("error", (err) => {
    pipelineState.running = false;
    pipelineState.error   = err.message;
    console.error("[pipeline] Erreur spawn :", err);
  });

  res.json({
    ok: true,
    pid: proc.pid,
    message: "Pipeline démarré",
    outputFile,
  });
});

// ── DELETE /api/pipeline/kill ──────────────────────────────────────────────
app.delete("/api/pipeline/kill", (req, res) => {
  if (!pipelineState.running || !pipelineState.pid) {
    return res.status(400).json({ error: "Aucun pipeline en cours" });
  }
  try {
    process.kill(pipelineState.pid, "SIGTERM");
    pipelineState.running = false;
    pipelineState.error   = "Arrêté manuellement";
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/fuzzy/dependencies ────────────────────────────────────────────
/**
 * Vérifie les dépendances Python nécessaires au fuzzy matching.
 * Retourne { rapidfuzz, sklearn, sentence_transformers, unidecode }
 */
app.get("/api/fuzzy/dependencies", (req, res) => {
  const checkScript = `
import json, sys
deps = {}
for name, mod in [
  ("rapidfuzz",            "rapidfuzz"),
  ("sklearn",              "sklearn"),
  ("sentence_transformers","sentence_transformers"),
  ("unidecode",            "unidecode"),
  ("numpy",                "numpy"),
]:
    try:
        __import__(mod)
        deps[name] = True
    except ImportError:
        deps[name] = False
print(json.dumps(deps))
`.trim();

  execFile(VENV_PYTHON, ["-c", checkScript], { cwd: __dirname }, (err, stdout) => {
    try {
      const deps = JSON.parse(stdout.trim());
      res.json({ ok: true, dependencies: deps });
    } catch {
      res.json({
        ok: false,
        error: err?.message || "Impossible de vérifier les dépendances",
        dependencies: {},
      });
    }
  });
});

// ── POST /api/fuzzy/match ──────────────────────────────────────────────────
/**
 * Fuzzy matching à la volée depuis le frontend (sans lancer le pipeline complet).
 * Body : { affiliations: string[], threshold: number }
 * Retourne les groupes détectés avec scores.
 */
app.post("/api/fuzzy/match", (req, res) => {
  const { affiliations = [], threshold = 0.82 } = req.body;
  if (!Array.isArray(affiliations) || affiliations.length === 0) {
    return res.status(400).json({ error: "affiliations[] requis" });
  }

  // Charge les canoniques depuis dictionary.json
  let canonicals = [];
  try {
    const dict = JSON.parse(fs.readFileSync(DICT_PATH, "utf-8"));
    const seen = new Set();
    for (const cat of Object.values(dict.categories || {})) {
      for (const v of Object.values(cat)) {
        if (!seen.has(v)) { seen.add(v); canonicals.push(v); }
      }
    }
  } catch { /* pas de dictionnaire — on utilise la liste en entrée comme auto-référence */ }

  if (canonicals.length === 0) {
    // Pas de référentiel → on tente de grouper les affiliations entre elles
    canonicals = [...affiliations];
  }

  const script = `
import json, sys
sys.path.insert(0, r"${__dirname.replace(/\\/g, "/")}")

affiliations = json.loads(sys.argv[1])
canonicals   = json.loads(sys.argv[2])
threshold    = float(sys.argv[3])

try:
    from affiliation_merger import FuzzyMatcher, normalize_affiliation
    matcher = FuzzyMatcher(canonicals, threshold=threshold, use_sbert=False)
    groups = {}
    for aff in affiliations:
        result = matcher.match(aff)
        if result:
            key = result["canonical"]
            if key not in groups:
                groups[key] = {"canonical": key, "variants": [], "scores": [], "method": result["method"]}
            groups[key]["variants"].append(aff)
            groups[key]["scores"].append(result["score"])
    output = list(groups.values())
    for g in output:
        g["confidence"] = round(sum(g["scores"]) / len(g["scores"]), 3)
        del g["scores"]
    print(json.dumps({"ok": True, "groups": output}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e), "groups": []}))
`.trim();

  execFile(
    VENV_PYTHON,
    ["-c", script, JSON.stringify(affiliations), JSON.stringify(canonicals), String(threshold)],
    { cwd: __dirname, maxBuffer: 10 * 1024 * 1024 },
    (err, stdout, stderr) => {
      try {
        const result = JSON.parse(stdout.trim());
        res.json(result);
      } catch {
        res.status(500).json({
          ok: false,
          error: stderr || err?.message || "Erreur fuzzy",
          groups: [],
        });
      }
    }
  );
});

// ── GET /api/outputs ───────────────────────────────────────────────────────
app.get("/api/outputs", (req, res) => {
  try {
    const files = fs.readdirSync(OUTPUTS_DIR)
      .filter((f) => f.endsWith(".xlsx") || f.endsWith(".csv"))
      .map((f) => {
        const stat = fs.statSync(path.join(OUTPUTS_DIR, f));
        return { name: f, size: stat.size, modifiedAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Démarrage ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n📚 Serveur Affiliation Merger démarré sur http://localhost:${PORT}`);
  console.log(`   Python     : ${VENV_PYTHON}`);
  console.log(`   Script     : ${PYTHON_SCRIPT}`);
  console.log(`   Dictionnaire : ${DICT_PATH}`);
  console.log(`   Outputs    : ${OUTPUTS_DIR}\n`);
});