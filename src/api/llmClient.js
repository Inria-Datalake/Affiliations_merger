/**
 * llmClient.js
 * Appelle l'API Mistral pour l'analyse des affiliations.
 * Modèle : mistral-small-latest
 *
 * Nécessite dans .env.local :
 *   VITE_MISTRAL_API_KEY=ta_clé_mistral
 */

const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const MODEL = "mistral-small-latest";

// Timeout des appels API (3 minutes par lot)
const REQUEST_TIMEOUT_MS = 180000;

// Nombre max de tentatives en cas d'erreur réseau / rate limit
const MAX_RETRIES = 3;

// Marqueur d'erreur non retentable (clé invalide, prompt trop gros...)
function fatal(message) {
  const e = new Error(message);
  e.fatal = true;
  return e;
}

/**
 * Appelle Mistral avec un prompt et retourne un objet JSON.
 * Gère : timeout, retry avec backoff, erreurs explicites.
 *
 * @param {Object} options
 * @param {string} options.prompt
 * @param {Object} options.response_json_schema
 * @returns {Promise<Object>}
 */
export async function invokeLLM({ prompt, response_json_schema }) {
  const apiKey = import.meta.env.VITE_MISTRAL_API_KEY;

  if (!apiKey) {
    throw fatal(
      "Clé API Mistral manquante. Ajoutez VITE_MISTRAL_API_KEY dans votre fichier .env.local puis relancez « npm run start »."
    );
  }

  const systemPrompt = response_json_schema
    ? `Tu dois répondre UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises markdown ni backticks. Le JSON doit respecter ce schéma : ${JSON.stringify(
        response_json_schema,
        null,
        2
      )}`
    : "Tu es un assistant utile.";

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(MISTRAL_API_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const apiMsg = error?.message || response.statusText;

        // ── Erreurs FATALES : on ne retente pas ──
        if (response.status === 401 || response.status === 403) {
          throw fatal(
            "Clé API Mistral invalide ou expirée (erreur 401). Vérifiez votre clé sur console.mistral.ai → API Keys, puis mettez à jour VITE_MISTRAL_API_KEY dans .env.local (à la racine du projet) et relancez « npm run start »."
          );
        }
        if (response.status === 413 || response.status === 422) {
          throw fatal(
            "Requête trop volumineuse pour l'API Mistral. Relancez l'analyse en activant le mode « Par lots de 50 » à l'étape d'import."
          );
        }

        // ── Erreurs RETENTABLES : 429 (rate limit), 5xx ──
        lastError = new Error(
          response.status === 429
            ? "Limite de requêtes Mistral atteinte (429) — nouvelle tentative..."
            : `Erreur API Mistral (${response.status}) : ${apiMsg}`
        );
        if (attempt < MAX_RETRIES) {
          // Backoff : 5s, 15s, 45s
          await new Promise((r) => setTimeout(r, 5000 * Math.pow(3, attempt - 1)));
          continue;
        }
        throw lastError;
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "";

      // Nettoyer les éventuels backticks résiduels
      const clean = text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

      try {
        return JSON.parse(clean);
      } catch {
        // Réponse incomplète (souvent un lot trop gros) → retentable
        lastError = fatal(
          `L'IA a renvoyé une réponse incomplète ou non parsable en JSON. Conseil : activez le mode « Par lots de 50 » à l'import. (Début de réponse : ${clean.slice(0, 100)}...)`
        );
        if (attempt === MAX_RETRIES) throw lastError;
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
    } catch (err) {
      clearTimeout(timeoutId);

      // Erreurs formatées avec fatal → propagation directe, pas de retry
      if (err.fatal) throw err;

      // Timeout réseau (AbortError)
      if (err.name === "AbortError") {
        lastError = fatal(
          `L'appel API a dépassé ${REQUEST_TIMEOUT_MS / 1000} secondes sans réponse. Vérifiez votre connexion, ou activez le mode « Par lots de 50 » à l'étape d'import.`
        );
        if (attempt === MAX_RETRIES) throw lastError;
        continue;
      }

      // Autre erreur réseau → retentable
      lastError = new Error(`Erreur réseau : ${err.message}`);
      if (attempt === MAX_RETRIES) throw lastError;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  throw lastError || new Error("L'appel à l'API Mistral a échoué après plusieurs tentatives.");
}