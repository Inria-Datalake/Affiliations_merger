/**
 * Client LLM de l'application.
 * Les appels à Mistral passent par le serveur local :
 * aucune clé API n'est exposée dans le navigateur.
 */

const REQUEST_TIMEOUT_MS = 180000;
const MAX_RETRIES = 3;

function fatal(message) {
  const error = new Error(message);
  error.fatal = true;
  return error;
}

export async function invokeLLM({ prompt, response_json_schema }) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw fatal("Le prompt envoyé à l'IA est vide.");
  }

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/llm`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, response_json_schema }),
      });

      clearTimeout(timeoutId);

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const apiMsg = data?.error || response.statusText;

        if (response.status === 429) {
          throw fatal(
            "Mistral a atteint sa limite d’utilisation (HTTP 429). " +
            "Aucune nouvelle tentative automatique : réessayez lorsque le quota sera disponible."
          );
        }

        if (response.status === 400 || response.status === 401 ||
            response.status === 403 || response.status === 413 ||
            response.status === 422 || response.status === 503) {
          throw fatal(`Erreur lors de l'appel à l'IA (${response.status}) : ${apiMsg}`);
        }

        lastError = new Error(
          response.status === 429
            ? "Limite de requêtes Mistral atteinte (429) — nouvelle tentative..."
            : `Erreur API (${response.status}) : ${apiMsg}`
        );

        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, 5000 * Math.pow(3, attempt - 1))
          );
          continue;
        }

        throw lastError;
      }

      const text = data?.content || "";
      const clean = text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

      try {
        return JSON.parse(clean);
      } catch {
        lastError = fatal(
          `L'IA a renvoyé une réponse non valide en JSON. Conseil : activez le mode « Par lots de 50 » à l'import. (Début de réponse : ${clean.slice(0, 100)}...)`
        );
        throw lastError;
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.fatal) throw error;

      if (error.name === "AbortError") {
        lastError = new Error(
          `L'appel à l'IA a dépassé ${REQUEST_TIMEOUT_MS / 1000} secondes.`
        );
      } else {
        lastError = new Error(`Erreur réseau : ${error.message}`);
      }

      if (attempt === MAX_RETRIES) throw lastError;

      await new Promise((resolve) =>
        setTimeout(resolve, 3000)
      );
    }
  }

  throw lastError || new Error("L'appel à l'IA a échoué après plusieurs tentatives.");
}
