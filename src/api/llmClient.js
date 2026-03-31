/**
 * llmClient.js
 * Appelle l'API Mistral pour l'analyse des affiliations.
 * Modèle : mistral-small-latest (rapide, gratuit sur le tier gratuit)
 *
 * Nécessite dans .env.local :
 *   VITE_MISTRAL_API_KEY=ta_clé_mistral
 */

const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const MODEL = "mistral-small-latest"; // Rapide et gratuit — peut être remplacé par "open-mistral-7b" pour encore plus de vitesse

/**
 * Appelle Mistral avec un prompt et retourne un objet JSON
 * @param {Object} options
 * @param {string} options.prompt
 * @param {Object} options.response_json_schema
 * @returns {Promise<Object>}
 */
export async function invokeLLM({ prompt, response_json_schema }) {
  const apiKey = import.meta.env.VITE_MISTRAL_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Clé API Mistral manquante. Ajoutez VITE_MISTRAL_API_KEY dans votre fichier .env.local"
    );
  }

  const systemPrompt = response_json_schema
    ? `Tu dois répondre UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises markdown ni backticks.
Le JSON doit respecter ce schéma : ${JSON.stringify(response_json_schema, null, 2)}`
    : "Tu es un assistant utile.";

  const response = await fetch(MISTRAL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1, // Faible température pour des réponses JSON stables
      response_format: { type: "json_object" }, // Force le mode JSON natif de Mistral
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Erreur API Mistral (${response.status}): ${error?.message || response.statusText}`
    );
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";

  // Nettoyer les éventuels backticks résiduels
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    return JSON.parse(clean);
  } catch {
    throw new Error(`Réponse non parsable en JSON : ${clean.slice(0, 200)}`);
  }
}