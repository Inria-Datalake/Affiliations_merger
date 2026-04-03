# Affiliation Merger

> Application web permettant de **fusionner, comparer et valider des affiliations** à partir d'un fichier CSV ou Excel, grâce à l'intelligence artificielle.

Développée par [Inria Datalake](https://github.com/Inria-Datalake) · Créée par Andréa NEBOT

---

## Aperçu

### Étape 1 — Import du fichier

![Import](https://raw.githubusercontent.com/Inria-Datalake/Affiliations_merger/main/docs/screenshot-import.png)

Importez votre fichier Excel ou CSV, sélectionnez la colonne à analyser et consultez les statistiques détectées (nombre de lignes, colonnes, dénominations uniques).

### Étape 3 — Validation des fusions

![Validation](https://raw.githubusercontent.com/Inria-Datalake/Affiliations_merger/main/docs/screenshot-validation.png)

Passez en revue les groupes proposés par l'IA : acceptez ou rejetez chaque groupe, excluez des variantes individuellement, renommez le nom fusionné, et filtrez par seuil de confiance.

---

## Fonctionnalités

- Import de fichiers `.csv`, `.xlsx`, `.xls`
- Sélection de la colonne à analyser (détection automatique)
- Statistiques à l'import : lignes, colonnes, dénominations uniques
- Pré-traitement automatique : déduplication exacte et détection des affiliations multi-organismes
- Détection automatique des affiliations similaires par un LLM (Mistral, OpenAI, Claude, Groq)
- Validation manuelle des fusions proposées :
  - Sélection / désélection par groupe et par variante individuelle
  - Renommage du nom fusionné proposé
  - Vérification dans le registre officiel **ROR** (Research Organization Registry)
  - Filtre par seuil de confiance (slider 0–99%)
  - Barre de recherche par groupe ou variante
  - Bouton **Ré-analyser** pour relancer sans réimporter
- Dictionnaire personnel d'affiliations (persistance sur disque, import/export JSON)
- Export CSV enrichi avec une colonne `Affiliation_Fusionnee`
- Possibilité de relancer un second tour de fusion sur la colonne fusionnée

---

## Prérequis

- [Node.js](https://nodejs.org/) v18 ou supérieur
- [Git](https://git-scm.com/)
- Une clé API pour un LLM (voir section [Configuration de la clé API](#configuration-de-la-clé-api))

---

## Installation

### 1. Forker le dépôt

Rendez-vous sur :
👉 [https://github.com/Inria-Datalake/Affiliations_merger](https://github.com/Inria-Datalake/Affiliations_merger)

Cliquez sur **Fork** en haut à droite pour créer votre propre copie du projet.

### 2. Cloner votre fork

```bash
git clone https://github.com/VOTRE_NOM_UTILISATEUR/Affiliations_merger.git
cd Affiliations_merger
```

### 3. Créer un environnement Node isolé (recommandé)

Utilisez [`nvm`](https://github.com/nvm-sh/nvm) (Node Version Manager) — équivalent du `venv` Python :

```bash
# Linux / macOS
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Recharger le terminal, puis :
nvm install 20
nvm use 20
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
# Lance Vite + le serveur de dictionnaire simultanément
npm run start

# Ou séparément :
npm run dev     # frontend sur http://localhost:5173
npm run server  # serveur dictionnaire sur http://localhost:3001
```

---

## Configuration de la clé API

L'application utilise un LLM pour analyser les affiliations. Vous devez fournir une clé API dans `.env.local`.

### Option recommandée : Mistral AI (gratuit)

1. Créez un compte sur [console.mistral.ai](https://console.mistral.ai)
2. Allez dans **API Keys** → **Create new key**
3. Copiez la clé générée et ajoutez-la dans `.env.local` :

```env
VITE_MISTRAL_API_KEY=votre_clé_mistral_ici
```

Le modèle utilisé par défaut est `mistral-small-latest`. Vous pouvez le modifier dans `src/api/llmClient.js` :

```js
const MODEL = "mistral-small-latest"; // ou "open-mistral-7b" pour plus de vitesse
```

### Autres fournisseurs supportés

Modifiez `src/api/llmClient.js` pour utiliser un autre fournisseur :

#### OpenAI (GPT-4o mini)

```env
VITE_OPENAI_API_KEY=votre_clé_openai_ici
```

```js
const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
  }),
});
```

#### Anthropic (Claude)

```env
VITE_ANTHROPIC_API_KEY=votre_clé_anthropic_ici
```

```js
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-calls": "true",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
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
const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
  },
  body: JSON.stringify({
    model: "llama-3.1-8b-instant",
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
  }),
});
```

---

## Format du fichier d'entrée

L'application accepte `.csv`, `.xlsx` et `.xls`. Votre fichier peut contenir **n'importe quelles colonnes** — vous sélectionnerez la colonne à analyser dans l'interface après l'import.

| ID | Auteur | Affiliations | Année |
|----|--------|--------------|-------|
| 1 | Dupont | Université de Lyon | 2023 |
| 2 | Martin | Univ. Lyon | 2023 |
| 3 | Leroy | INRIA Grenoble | 2022 |

---

## Dictionnaire d'affiliations

L'application intègre un dictionnaire personnel qui mémorise vos fusions validées pour les réutiliser automatiquement lors des prochaines analyses. Il est sauvegardé dans `dictionary.json` à la racine du projet (nécessite `npm run server`).

- **Export JSON** : partagez votre dictionnaire avec vos collègues
- **Import JSON** : chargez un dictionnaire existant
- **Catégories** : Affiliations, Pays, Laboratoires, Établissements + catégories personnalisées

---

## Structure du projet

```
affiliations_merger/
├── server.js                   # Serveur Express (persistance dictionnaire)
├── dictionary.json             # Dictionnaire local (créé automatiquement)
├── .env.local                  # Clé API (non versionné)
└── src/
    ├── api/
    │   └── llmClient.js        # Client LLM (Mistral par défaut)
    ├── hooks/
    │   ├── useDictionary.js    # Gestion du dictionnaire
    │   └── useROR.js           # Intégration ROR
    ├── components/
    │   ├── merger/
    │   │   ├── AnalysisLoader.jsx
    │   │   ├── DictionaryManager.jsx
    │   │   ├── ExportResult.jsx
    │   │   ├── FileUpload.jsx
    │   │   ├── FusionReview.jsx
    │   │   ├── PreProcessReport.jsx
    │   │   ├── RORSearch.jsx
    │   │   └── Stepper.jsx
    │   └── ui/                 # Composants shadcn/ui
    ├── pages/
    │   └── AffiliationMerger.jsx
    └── App.jsx
```

---


## Exemple de traitement que fait l'application avec le fichier importé

![Exemple](https://raw.githubusercontent.com/Inria-Datalake/Affiliations_merger/refs/heads/main/docs/exemple_traitement.png)


## Contribuer

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une *issue* ou une *pull request* sur votre fork.

---

## Licence

Ce projet est développé par [Inria Datalake](https://github.com/Inria-Datalake).
