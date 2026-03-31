# Affiliation Merger

> Application web permettant de **fusionner, comparer et valider des affiliations** à partir d'un fichier CSV ou Excel, grâce à l'intelligence artificielle.

Développée par [Inria Datalake](https://github.com/Inria-Datalake)..

---

## Aperçu

### Étape 1 — Import du fichier

![Import](https://raw.githubusercontent.com/Inria-Datalake/Affiliations_merger/main/docs/screenshot-import.png)

Importez votre fichier Excel ou CSV, sélectionnez la colonne à analyser et consultez les statistiques détectées (nombre de lignes, colonnes, dénominations uniques).

---

### Étape 3 — Validation des fusions

![Validation](https://raw.githubusercontent.com/Inria-Datalake/Affiliations_merger/main/docs/screenshot-validation.png)

Passez en revue les groupes proposés par l'IA : acceptez ou rejetez chaque groupe, excluez des variantes individuellement, renommez le nom fusionné, et filtrez par seuil de confiance.

---

## Fonctionnalités

- Import de fichiers `.csv`, `.xlsx`, `.xls`
- Sélection de la colonne à analyser (détection automatique)
- Statistiques à l'import : lignes, colonnes, dénominations uniques
- Détection automatique des affiliations similaires par un LLM
- Validation manuelle des fusions proposées :
  - Sélection / désélection par groupe
  - Exclusion de variantes individuelles au sein d'un groupe
  - Renommage du nom fusionné proposé
  - Filtre par seuil de confiance (slider 0–99%)
  - Barre de recherche par groupe ou variante
  - Bouton **Ré-analyser** pour relancer sans réimporter
- Export CSV enrichi avec une colonne `Affiliation_Fusionnee` ajoutée aux données originales

---

## Prérequis

- [Node.js](https://nodejs.org/) v18 ou supérieur
- [Git](https://git-scm.com/)
- Une clé API pour un LLM (voir section [Configuration de la clé API](#configuration-de-la-clé-api))

---

## Installation

### 1. Forker le dépôt

Rendez-vous sur le dépôt GitHub :
👉 [https://github.com/Inria-Datalake/Affiliations_merger](https://github.com/Inria-Datalake/Affiliations_merger)

Cliquez sur le bouton **Fork** en haut à droite pour créer votre propre copie du projet.

### 2. Cloner votre fork

```bash
git clone https://github.com/VOTRE_NOM_UTILISATEUR/Affiliations_merger.git
cd Affiliations_merger
```

### 3. Créer un environnement virtuel Node (recommandé)

Utilisez [`nvm`](https://github.com/nvm-sh/nvm) (Node Version Manager) pour isoler la version de Node utilisée par le projet :

```bash
# Installer nvm (Linux / macOS)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Recharger le terminal, puis :
nvm install 20
nvm use 20

# Vérifier
node --version
```

> **Windows** : utilisez [nvm-windows](https://github.com/coreybutler/nvm-windows) à la place.

### 4. Installer les dépendances

```bash
npm install
```

### 5. Configurer la clé API

Créez un fichier `.env.local` à la racine du projet :

```bash
# Linux / macOS
touch .env.local

# Windows (PowerShell)
New-Item .env.local
```

Ajoutez-y votre clé API (voir section suivante).

### 6. Lancer l'application

```bash
npm run dev
```

L'application est accessible sur [http://localhost:5173](http://localhost:5173).

---

## Configuration de la clé API

L'application utilise un LLM pour analyser les affiliations. Vous devez fournir une clé API dans `.env.local`.

### Option recommandée : Mistral AI (gratuit)

1. Créez un compte sur [console.mistral.ai](https://console.mistral.ai)
2. Allez dans **API Keys** → **Create new key**
3. Copiez la clé générée
4. Ajoutez-la dans `.env.local` :

```env
VITE_MISTRAL_API_KEY=votre_clé_mistral_ici
```

Le modèle utilisé par défaut est `mistral-small-latest`. Vous pouvez le modifier dans `src/api/llmClient.js` :

```js
const MODEL = "mistral-small-latest"; // ou "open-mistral-7b" pour encore plus de vitesse
```

---

### Autres fournisseurs supportés

Vous pouvez remplacer Mistral par n'importe quel autre fournisseur en modifiant `src/api/llmClient.js`.

#### OpenAI (GPT-4o mini)

```env
VITE_OPENAI_API_KEY=votre_clé_openai_ici
```

```js
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

const response = await fetch(OPENAI_API_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
  }),
});
```

#### Anthropic (Claude)

```env
VITE_ANTHROPIC_API_KEY=votre_clé_anthropic_ici
```

```js
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

const response = await fetch(ANTHROPIC_API_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-calls": "true",
  },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  }),
});
```

#### Groq (ultra rapide, gratuit)

```env
VITE_GROQ_API_KEY=votre_clé_groq_ici
```

```js
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";

const response = await fetch(GROQ_API_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
  },
  body: JSON.stringify({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
  }),
});
```

---

## Format du fichier d'entrée

L'application accepte `.csv`, `.xlsx` et `.xls`. Votre fichier peut contenir **n'importe quelles colonnes** — vous sélectionnerez la colonne à analyser dans l'interface après l'import.

Exemple :

| ID | Auteur | Affiliations | Année |
|----|--------|--------------|-------|
| 1 | Dupont | Université de Lyon | 2023 |
| 2 | Martin | Univ. Lyon | 2023 |
| 3 | Leroy | INRIA Grenoble | 2022 |

---

## Structure du projet

```
src/
├── api/
│   └── llmClient.js            # Client LLM (Mistral par défaut)
├── components/
│   ├── merger/
│   │   ├── AnalysisLoader.jsx  # Écran de chargement avec progression
│   │   ├── ExportResult.jsx    # Écran d'export
│   │   ├── FileUpload.jsx      # Import et sélection de colonne
│   │   ├── FusionReview.jsx    # Validation des fusions
│   │   └── Stepper.jsx         # Indicateur d'étapes
│   └── ui/                     # Composants shadcn/ui
├── pages/
│   └── AffiliationMerger.jsx   # Page principale
└── App.jsx
```

---

## Contribuer

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une *issue* ou une *pull request* sur votre fork.

---

## Licence

Ce projet est développé par [Inria Datalake](https://github.com/Inria-Datalake).