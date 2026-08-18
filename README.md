# Affiliation Merger

> Application web permettant de **fusionner, comparer et valider des affiliations** à partir d'un fichier CSV ou Excel, grâce à l'intelligence artificielle.

Développée par [Inria Datalake](https://github.com/Inria-Datalake) · Créée par Andréa NEBOT — Groupe DATALAKE

---

## Aperçu

L'application guide l'utilisateur à travers **4 étapes simples** :

### Étape 1 — Import du fichier

![Import](https://base44.app/api/apps/6a840ff8c52227525cd9ccb1/files/mp/public/6a840ff8c52227525cd9ccb1/04940acb5_screenshot-import.png)

Importez votre fichier Excel ou CSV par glisser-déposer, sélectionnez la colonne à analyser et consultez les statistiques détectées (nombre de lignes, colonnes, dénominations uniques). Vous pouvez aussi configurer le mode de traitement (appel unique ou par lots de 50) et le seuil de confiance minimum.

### Étape 2 — Validation des fusions

![Validation](https://base44.app/api/apps/6a840ff8c52227525cd9ccb1/files/mp/public/6a840ff8c52227525cd9ccb1/b926d4788_screenshot-validation.png)

Passez en revue les groupes proposés par l'IA : acceptez ou rejetez chaque groupe, excluez des variantes individuellement, renommez le nom fusionné, et filtrez par seuil de confiance. Chaque variante affiche le nombre de publications concernées.

### Étape 3 — Scission IA des affiliations multi-organismes

![Scission IA](https://base44.app/api/apps/6a840ff8c52227525cd9ccb1/files/mp/public/6a840ff8c52227525cd9ccb1/15c68a7a1_screenshot-split-ia.png)

Lorsqu'une affiliation contient plusieurs organismes (ex: "CSAIL Massachusetts Institute of Technology google deepmind meta"), cliquez sur **Scinder** puis utilisez la **détection IA** pour identifier automatiquement les entités distinctes. L'IA reconnaît les filiales — "Google DeepMind" reste une seule entité, pas deux.

### Étape 4 — Export des résultats

![Export](https://base44.app/api/apps/6a840ff8c52227525cd9ccb1/files/mp/public/6a840ff8c52227525cd9ccb1/f7f1cc822_screenshot-export.png)

Téléchargez le résultat en CSV ou en Excel coloré. Le fichier contient toutes vos colonnes originales + une colonne `Affiliation_Fusionnee` + une colonne `ROR_ID`. Les lignes issues de scissions sont surlignées en jaune, les affiliations fusionnées en bleu clair.

---

## Fonctionnalités

### Import & analyse
- Import de fichiers `.csv`, `.xlsx`, `.xls` par glisser-déposer
- Sélection de la colonne à analyser (détection automatique de la colonne "Affiliation")
- Statistiques à l'import : lignes, colonnes, dénominations uniques
- Pré-traitement automatique : déduplication exacte et détection des affiliations multi-organismes
- Mode de traitement au choix : appel unique (rapide) ou par lots de 50 (fiable pour grands volumes)
- Seuil de confiance minimum ajustable (slider 0–95%)

### Fusion par IA
- Détection automatique des affiliations similaires par un LLM (Mistral, OpenAI, Claude, Groq)
- Dictionnaire personnel : les fusions validées sont mémorisées et réutilisées automatiquement
- Gestion par catégories (Affiliations, Pays, Laboratoires, etc.) + catégories personnalisées
- Persistance sur disque (`dictionary.json`) ou en `localStorage` (si serveur indisponible)
- Import/export du dictionnaire en JSON

### Validation & contrôle
- Sélection / désélection par groupe et par variante individuelle
- Renommage du nom fusionné proposé
- Vérification dans le registre officiel **ROR** (Research Organization Registry)
- Filtre par seuil de confiance avec distribution visuelle (élevé / moyen / faillible)
- Barre de recherche par groupe ou variante
- Bouton **Ré-analyser** pour relancer sans réimporter
- Ajout manuel d'une fusion validée au dictionnaire (choix de la catégorie)

### Scission intelligente des multi-affiliations
- Détection IA des organismes distincts dans une chaîne d'affiliation
- Reconnaissance des **filiales** (ex: "Google DeepMind" = 1 entité, pas "Google" + "DeepMind")
- Score de confiance par entité détectée + raisonnement explicite de l'IA
- Édition manuelle des propositions de l'IA (ajouter, modifier, supprimer)
- Suivi des **publications concernées** : compteur par variante + récapitulatif à l'export

### Export
- Export CSV enrichi avec colonne `Affiliation_Fusionnee` + `ROR_ID`
- Export **Excel coloré** (.xls) :
  - Bleu `#2563EB` pour l'en-tête de la colonne fusionnée
  - Bleu ciel `#60A5FA` pour l'en-tête de la colonne ROR
  - Bleu clair `#DBEAFE` pour les cellules fusionnées
  - Jaune `#FFFACD` pour les lignes ajoutées par scission
- Une ligne par affiliation dans l'export (les scissions génèrent des lignes supplémentaires)
- Tableau récapitulatif "Publications concernées par les scissions"
- Possibilité de relancer un **second tour de fusion** sur la colonne fusionnée

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
    model: "claude-3-5-sonnet-20241022",
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

> 💡 **Astuce** : Plus votre fichier contient de lignes avec des affiliations similaires (variantes, abréviations), plus l'IA sera efficace pour détecter les fusions pertinentes.

---

## Dictionnaire d'affiliations

L'application intègre un dictionnaire personnel qui mémorise vos fusions validées pour les réutiliser automatiquement lors des prochaines analyses. Il est sauvegardé dans `dictionary.json` à la racine du projet (nécessite `npm run server`).

- **Export JSON** : partagez votre dictionnaire avec vos collègues
- **Import JSON** : chargez un dictionnaire existant
- **Catégories** : Affiliations, Pays, Laboratoires, Établissements + catégories personnalisées
- **Sauvegarde automatique** : chaque fusion validée est ajoutée au dictionnaire

---

## Scission des affiliations multi-organismes

Certaines chaînes d'affiliation contiennent plusieurs organismes concaténés sans séparateur clair. Par exemple :

```
CSAIL Massachusetts Institute of Technology google deepmind meta
```

L'application permet de **scinder** ces chaînes en affiliations distinctes :

1. Dans l'écran de validation, **désélectionnez** la variante concernée
2. Cliquez sur le bouton **Scinder** qui apparaît
3. Utilisez le bouton **Détection IA** pour une analyse automatique
4. L'IA identifie les entités distinctes et reconnaît les filiales :
   - `CSAIL` → entité distincte
   - `Massachusetts Institute of Technology` → entité distincte
   - `Google DeepMind` → **une seule entité** (DeepMind est une filiale de Google)
   - `Meta` → entité distincte
5. Vérifiez le résultat, modifiez si besoin, puis validez

Chaque affiliation scindée génère **une ligne supplémentaire** dans le fichier d'export, de sorte que chaque publication apparaît avec toutes ses affiliations individuelles.

---

## Structure du projet

```
affiliations_merger/
├── server.js                   # Serveur Express (persistance dictionnaire)
├── dictionary.json             # Dictionnaire local (créé automatiquement)
├── .env.local                  # Clé API (non versionné)
├── docs/                       # Screenshots et documentation
│   ├── screenshot-import.png
│   ├── screenshot-validation.png
│   ├── screenshot-split-ia.png
│   └── screenshot-export.png
└── src/
    ├── api/
    │   └── llmClient.js        # Client LLM (Mistral par défaut)
    ├── hooks/
    │   ├── useDictionary.js    # Gestion du dictionnaire
    │   └── useROR.js           # Intégration ROR
    ├── components/
    │   ├── merger/
    │   │   ├── AnalysisLoader.jsx     # Écran de chargement
    │   │   ├── DictionaryManager.jsx   # Gestion du dictionnaire
    │   │   ├── ExportResult.jsx       # Écran d'export
    │   │   ├── FileUpload.jsx         # Écran d'import
    │   │   ├── FusionReview.jsx       # Validation + scission IA
    │   │   ├── PreProcessReport.jsx   # Rapport de pré-traitement
    │   │   ├── RORSearch.jsx          # Recherche ROR
    │   │   └── Stepper.jsx            # Barre de progression
    │   └── ui/                 # Composants shadcn/ui
    ├── pages/
    │   └── AffiliationMerger.jsx      # Page principale (orchestrateur)
    └── App.jsx
```

---

## Exemple de traitement

Voici un exemple concret du traitement effectué par l'application :

**Fichier d'entrée** (extrait) :

| Auteur | Affiliations |
|--------|-------------|
| Alice | Univ. Lyon ; INRIA |
| Bob | University of Lyon |
| Charlie | INRIA Grenoble ; CSAIL MIT google deepmind |

**Après traitement** :

| Auteur | Affiliations | Affiliation_Fusionnee | ROR_ID |
|--------|-------------|----------------------|--------|
| Alice | Univ. Lyon ; INRIA | Université de Lyon | https://ror.org/029brtt94 |
| Alice | Univ. Lyon ; INRIA | Inria | https://ror.org/02kv1f702 |
| Bob | University of Lyon | Université de Lyon | https://ror.org/029brtt94 |
| Charlie | INRIA Grenoble ; CSAIL MIT google deepmind | Inria | https://ror.org/02kv1f702 |
| Charlie | INRIA Grenoble ; CSAIL MIT google deepmind | CSAIL | |
| Charlie | INRIA Grenoble ; CSAIL MIT google deepmind | Massachusetts Institute of Technology | https://ror.org/042nb2s44 |
| Charlie | INRIA Grenoble ; CSAIL MIT google deepmind | Google DeepMind | |

> 📝 Dans cet exemple, "Univ. Lyon" et "University of Lyon" sont fusionnées en "Université de Lyon", et la chaîne de Charlie est scindée en 4 affiliations distinctes. "Google DeepMind" est reconnu comme une seule entité (filiale de Google).

---

## Contribuer

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une *issue* ou une *pull request* sur votre fork.

---

## Licence

Ce projet est développé par [Inria Datalake](https://github.com/Inria-Datalake) · Créée par Andréa NEBOT — Groupe DATALAKE.
