/**
 * server.js
 * Petit serveur Express qui expose 2 routes :
 *   GET  /api/dictionary  → lit dictionary.json
 *   POST /api/dictionary  → écrit dictionary.json
 *
 * Lancement : node server.js
 * Le fichier dictionary.json est créé à la racine du projet.
 */

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;
const DICT_PATH = path.join(__dirname, "dictionary.json");

// ── Middleware ────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));

// CORS pour autoriser Vite (port 5173) à appeler ce serveur
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── GET /api/dictionary ───────────────────────────────────────
app.get("/api/dictionary", (req, res) => {
  if (!fs.existsSync(DICT_PATH)) {
    return res.json(null); // Pas encore de dictionnaire
  }
  try {
    const data = JSON.parse(fs.readFileSync(DICT_PATH, "utf-8"));
    res.json(data);
  } catch (err) {
    console.error("Erreur lecture dictionary.json :", err);
    res.status(500).json({ error: "Erreur de lecture" });
  }
});

// ── POST /api/dictionary ──────────────────────────────────────
app.post("/api/dictionary", (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.categories) {
      return res.status(400).json({ error: "Format invalide" });
    }
    fs.writeFileSync(DICT_PATH, JSON.stringify(data, null, 2), "utf-8");
    console.log(`✅ Dictionnaire sauvegardé (${Object.values(data.categories).reduce((s, c) => s + Object.keys(c).length, 0)} entrées)`);
    res.json({ ok: true });
  } catch (err) {
    console.error("Erreur écriture dictionary.json :", err);
    res.status(500).json({ error: "Erreur d'écriture" });
  }
});

// ── Démarrage ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n📚 Serveur dictionnaire démarré sur http://localhost:${PORT}`);
  console.log(`   Fichier : ${DICT_PATH}\n`);
});
