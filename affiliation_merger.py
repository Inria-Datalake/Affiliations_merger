"""
affiliation_merger.py
=====================
Pipeline complet de nettoyage, normalisation et fusion des affiliations académiques.

Étapes :
  1. Nettoyage des symboles spéciaux + rapport
  2. Parsing des listes d'affiliations (explosion) — gère ; | / et listes Python
  3. Normalisation Unicode + abréviations
  4. Mapping canonique via dictionary.json (issu de l'interface web)
  5. Fuzzy matching en 3 passes : TF-IDF → Levenshtein → Embeddings multilingues
  6. Filtrage primary / dept
  7. Export enrichi : affil_originale, affil_normalisée, affil_pivot, niveau, score

Usage :
  python affiliation_merger.py --input affil_normalize.xlsx --output result.xlsx
  python affiliation_merger.py --input affil_normalize.xlsx --output result.xlsx --fuzzy --threshold 0.82
  python affiliation_merger.py --input affil_normalize.xlsx --output result.xlsx --no-filter --no-failed
"""

import argparse
import ast
import json
import os
import re
import unicodedata
from collections import Counter
from pathlib import Path

import pandas as pd

try:
    from unidecode import unidecode
    HAS_UNIDECODE = True
except ImportError:
    HAS_UNIDECODE = False
    def unidecode(s): return s

# Fuzzy matching — optionnels mais fortement recommandés
try:
    from rapidfuzz import fuzz, process as rfprocess
    HAS_RAPIDFUZZ = True
except ImportError:
    HAS_RAPIDFUZZ = False

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    import numpy as np
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False

# Embeddings multilingues — optionnels (lourd mais très efficace fr/en/es)
try:
    from sentence_transformers import SentenceTransformer
    HAS_SBERT = True
except ImportError:
    HAS_SBERT = False


# ──────────────────────────────────────────────────────────────────────────────
# CONSTANTES
# ──────────────────────────────────────────────────────────────────────────────

_SYMBOL_PATTERN = r"[^\w\s.,;:!?()\"\'/\-]"

# Séparateurs multi-affiliations : ; ou | ou " / " (slash entouré d'espaces)
_MULTI_SEP = re.compile(r"\s*;\s*|\s*\|\s*|\s{1,3}/\s{1,3}")

# Abréviations → formes longues (couche 2, avant fuzzy)
ABBREVIATIONS: dict[str, str] = {
    r"\bUniv\.?\b":        "University",
    r"\bDept\.?\b":        "Department",
    r"\bDep\.?\b":         "Department",
    r"\bLab\.?\b":         "Laboratory",
    r"\bInst\.?\b":        "Institute",
    r"\bFac\.?\b":         "Faculty",
    r"\bSci\.?\b":         "Science",
    r"\bEng\.?\b":         "Engineering",
    r"\bTech\.?\b":        "Technology",
    r"\bMed\.?\b":         "Medicine",
    r"\bComp\.?\b":        "Computer",
    r"\bMath\.?\b":        "Mathematics",
    r"\bProf\.?\b":        "Professor",
    r"\bDr\.?\b":          "Doctor",
    r"\bRes\.?\b":         "Research",
    r"\bNat\.?\b":         "National",
    r"\bIntl\.?\b":        "International",
    r"\bCtr\.?\b":         "Center",
    r"\bCntr\.?\b":        "Center",
    r"\bCol\.?\b":         "College",
    r"\bAcad\.?\b":        "Academy",
    r"\bSoc\.?\b":         "Society",
    r"\bAssoc\.?\b":       "Association",
    r"\bFound\.?\b":       "Foundation",
    r"\bHosp\.?\b":        "Hospital",
    r"\bSch\.?\b":         "School",
    r"\bGrad\.?\b":        "Graduate",
    r"\bAmér\.?\b":        "American",
    r"\bEur\.?\b":         "European",
}

# Table multilingue : formes étrangères → pivot anglais
MULTILINGUAL: dict[str, str] = {
    # Français → Anglais
    r"\bUniversité\b":              "University",
    r"\bUniversite\b":              "University",
    r"\bInstitut\b":                "Institute",
    r"\bÉcole\b":                   "School",
    r"\bEcole\b":                   "School",
    r"\bLaboratoire\b":             "Laboratory",
    r"\bCentre\b":                  "Center",
    r"\bDépartement\b":             "Department",
    r"\bDepartement\b":             "Department",
    r"\bFaculté\b":                 "Faculty",
    r"\bFaculte\b":                 "Faculty",
    r"\bRecherche\b":               "Research",
    r"\bSciences\b":                "Science",
    r"\bMédecine\b":                "Medicine",
    r"\bMedecine\b":                "Medicine",
    r"\bNationale?\b":              "National",
    r"\bFédérale?\b":               "Federal",
    r"\bPolytechnique\b":           "Polytechnic",
    # Espagnol → Anglais
    r"\bUniversidad\b":             "University",
    r"\bInstituto\b":               "Institute",
    r"\bEscuela\b":                 "School",
    r"\bLaboratorio\b":             "Laboratory",
    r"\bCentro\b":                  "Center",
    r"\bDepartamento\b":            "Department",
    r"\bFacultad\b":                "Faculty",
    r"\bInvestigaci[oó]n\b":        "Research",
    r"\bCiencias\b":                "Science",
    r"\bNacional\b":                "National",
    # Allemand → Anglais
    r"\bUniversit[äa]t\b":          "University",
    r"\bInstitut\b":                "Institute",
    r"\bFakult[äa]t\b":             "Faculty",
    r"\bLehrstuhl\b":               "Department",
    r"\bForschung\b":               "Research",
    r"\bWissenschaft\b":            "Science",
    r"\bNational\b":                "National",
    # Italien → Anglais
    r"\bUniversit[àa]\b":           "University",
    r"\bIstituto\b":                "Institute",
    r"\bDipartimento\b":            "Department",
    r"\bRicerca\b":                 "Research",
    r"\bScuola\b":                  "School",
    # Portugais → Anglais
    r"\bUniversidade\b":            "University",
    r"\bInstituto\b":               "Institute",
    r"\bDepartamento\b":            "Department",
    r"\bPesquisa\b":                "Research",
    r"\bFaculdade\b":               "Faculty",
}

# Mots-clés pour classification hiérarchique
_LEVEL_PRIMARY  = r"university|universite|universit[äàa]|universidade|universidad|institute|institution|academy|college|ecole|school|cnrs|inria|inserm|inrae|cea|csiro|riken|fraunhofer|helmholtz|max planck"
_LEVEL_DEPT     = r"department|departement|departamento|dipartimento|laboratory|laboratoire|laboratorio|lab\b|umr|ura|centre|center|centro|unit[ée]|group|division|section"
_LEVEL_HOSPITAL = r"hospital|h[oô]pital|clinic|chu|chru|aphp"

# Mots-clés pour le filtre primary/dept (hérité)
_PRIMARY_KW = r"univ|instit|istitut|cnrs|group|company|academy|college|ecole|facult|laboratory|laborator"
_DEPT_KW    = r"department|dept|departement|laboratoire|lab\b|cent|umr|school"


# ──────────────────────────────────────────────────────────────────────────────
# DICTIONNAIRE MAPPING CANONIQUE (fallback statique si dictionary.json absent)
# ──────────────────────────────────────────────────────────────────────────────

AFFILIATION_MAPPING: dict[str, str] = {
    # ── Google ──────────────────────────────────────────────────────────────
    "google deepmind": "Google DeepMind",
    "deepmind": "Google DeepMind",
    "google brain": "Google",
    "google research": "Google",
    "google ai": "Google",
    "google quantum": "Google",
    "google cloud": "Google",
    "brain team": "Google",
    "google": "Google",
    # ── Meta / Facebook ──────────────────────────────────────────────────────
    "facebook ai research": "Meta",
    "fundamental ai research": "Meta",
    "fair": "Meta",
    "facebook ai": "Meta",
    "facebook artificial intelligence": "Meta",
    "facebook": "Meta",
    "meta ai": "Meta",
    "meta": "Meta",
    # ── Microsoft ────────────────────────────────────────────────────────────
    "microsoft research asia": "Microsoft Research Asia",
    "microsoft research": "Microsoft Research",
    "microsoft": "Microsoft",
    # ── Amazon / AWS ─────────────────────────────────────────────────────────
    "amazon web services": "Amazon",
    "aws ai": "Amazon",
    "aws": "Amazon",
    "amazon research": "Amazon",
    "amazon": "Amazon",
    # ── Apple ────────────────────────────────────────────────────────────────
    "apple": "Apple",
    # ── NVIDIA ───────────────────────────────────────────────────────────────
    "nvidia": "NVIDIA",
    # ── IBM ──────────────────────────────────────────────────────────────────
    "ibm research": "IBM Research",
    "ibm watson": "IBM Research",
    "ibm": "IBM Research",
    # ── Baidu ────────────────────────────────────────────────────────────────
    "baidu research": "Baidu",
    "baidu": "Baidu",
    # ── Alibaba ──────────────────────────────────────────────────────────────
    "alibaba cloud": "Alibaba",
    "alibaba": "Alibaba",
    # ── Huawei ───────────────────────────────────────────────────────────────
    "huawei technologies": "Huawei",
    "huawei": "Huawei",
    # ── Divers tech ──────────────────────────────────────────────────────────
    "samsung": "Samsung",
    "bytedance research": "ByteDance",
    "bytedance": "ByteDance",
    "tencent": "Tencent",
    "bosch research": "Bosch",
    "bosch": "Bosch",
    "intel labs": "Intel",
    "intel": "Intel",
    "adobe research": "Adobe",
    "adobe": "Adobe",
    "salesforce research": "Salesforce",
    "salesforce": "Salesforce",
    "uber ai": "Uber",
    "uber": "Uber",
    "snap": "Snap",
    "twitter": "Twitter (X)",
    "x corp": "Twitter (X)",
    "linkedin": "LinkedIn",
    "cohere for ai": "Cohere",
    "cohere": "Cohere",
    "hugging face": "Hugging Face",
    "element ai": "Element AI",
    "ant financial": "Ant Financial",
    "ant group": "Ant Financial",
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "deepl": "DeepL",
    "siemens": "Siemens",
    "sony": "Sony",
    "philips": "Philips",
    "thales": "Thales",
    "ericsson": "Ericsson",
    "oracle": "Oracle",
    "qualcomm": "Qualcomm",
    "graphcore": "Graphcore",
    "waymo": "Waymo",
    # ── Universités ──────────────────────────────────────────────────────────
    "massachusetts institute of technology": "MIT",
    "csail": "MIT",
    "mit": "MIT",
    "stanford": "Stanford University",
    "uc berkeley": "UC Berkeley",
    "berkeley ai research": "UC Berkeley",
    "university of california berkeley": "UC Berkeley",
    "berkeley": "UC Berkeley",
    "uc san diego": "UC San Diego",
    "ucsd": "UC San Diego",
    "ucla": "UCLA",
    "uc los angeles": "UCLA",
    "university of california": "University of California",
    "carnegie mellon": "Carnegie Mellon University",
    "cmu": "Carnegie Mellon University",
    "cornell": "Cornell University",
    "princeton": "Princeton University",
    "yale": "Yale University",
    "columbia": "Columbia University",
    "harvard": "Harvard University",
    "new york university": "NYU",
    "nyu": "NYU",
    "university of washington": "University of Washington",
    "university of toronto": "University of Toronto",
    "uoft": "University of Toronto",
    "university of michigan": "University of Michigan",
    "umich": "University of Michigan",
    "university of oxford": "University of Oxford",
    "oxford": "University of Oxford",
    "university of cambridge": "University of Cambridge",
    "cambridge": "University of Cambridge",
    "university college london": "UCL",
    "gatsby unit": "UCL",
    "ucl": "UCL",
    "imperial college": "Imperial College London",
    "georgia tech": "Georgia Tech",
    "georgia institute of technology": "Georgia Tech",
    "caltech": "Caltech",
    "california institute of technology": "Caltech",
    "university of texas at austin": "UT Austin",
    "ut austin": "UT Austin",
    "university of alberta": "University of Alberta",
    "mcgill": "McGill University",
    "mila": "Mila",
    "kaist": "KAIST",
    "postech": "POSTECH",
    "hkust": "HKUST",
    "tsinghua": "Tsinghua University",
    "peking university": "Peking University",
    "eth zurich": "ETH Zurich",
    "eth": "ETH Zurich",
    "ecole polytechnique federale de lausanne": "EPFL",
    "epfl": "EPFL",
    "polytechnique montreal": "Polytechnique Montréal",
    "sorbonne": "Université Paris-Sorbonne",
    "psl": "PSL University",
    "ens paris": "ENS Paris",
    "ecole normale superieure": "ENS Paris",
    "ens": "ENS",
    "ku leuven": "KU Leuven",
    "university of edinburgh": "University of Edinburgh",
    "edinburgh": "University of Edinburgh",
    "alan turing institute": "Alan Turing Institute",
    "university of warwick": "University of Warwick",
    "warwick": "University of Warwick",
    "sharif university": "Sharif University",
    "iit bombay": "IIT Bombay",
    "iit delhi": "IIT Delhi",
    "iit kharagpur": "IIT Kharagpur",
    "iit madras": "IIT Madras",
    "iit kanpur": "IIT Kanpur",
    "iit": "IIT",
    # ── Instituts ────────────────────────────────────────────────────────────
    "max planck": "Max Planck Institute",
    "inria": "INRIA",
    "cnrs": "CNRS",
    "cea": "CEA",
    "inserm": "INSERM",
    "inrae": "INRAE",
    "csiro": "CSIRO",
    "riken": "RIKEN",
    "fraunhofer": "Fraunhofer Institute",
    "helmholtz": "Helmholtz",
    "cifar": "CIFAR",
    "kth": "KTH",
    "dtu": "DTU",
    "ist austria": "ISTA",
    "ista": "ISTA",
    "conicet": "CONICET",
    "aist": "AIST",
    "a star": "A*STAR",
    "agency for science technology and research": "A*STAR",
    "ensae": "ENSAE",
    "ensta": "ENSTA",
    "insa": "INSA",
    "mines": "Mines",
    "eurecom": "EURECOM",
    "cnam": "CNAM",
    "conservatoire national des arts et metiers": "CNAM",
    "crest": "CREST",
    "grenoble inp": "Grenoble INP",
    "hec": "HEC",
}


# ──────────────────────────────────────────────────────────────────────────────
# 0. CHARGEMENT DU DICTIONARY.JSON (interface web)
# ──────────────────────────────────────────────────────────────────────────────

def load_web_dictionary(dict_path: str | None = None) -> dict[str, str]:
    """
    Charge le dictionnaire produit par l'interface web (dictionary.json).
    Format attendu : { "categories": { "Affiliations": { "variante": "canonique", ... }, ... } }
    Retourne un dict plat variante_normalisée → canonique.
    """
    if dict_path is None:
        # Cherche dictionary.json dans le dossier courant ou celui du script
        candidates = [
            Path("dictionary.json"),
            Path(__file__).parent / "dictionary.json",
        ]
        dict_path = next((str(p) for p in candidates if p.exists()), None)

    if not dict_path or not Path(dict_path).exists():
        return {}

    try:
        with open(dict_path, encoding="utf-8") as f:
            data = json.load(f)
        mapping = {}
        for _cat, entries in data.get("categories", {}).items():
            for variant, canonical in entries.items():
                norm = normalize_text(variant)
                if norm:
                    mapping[norm] = canonical.strip()
        print(f"📚 Dictionnaire web chargé : {len(mapping)} entrées")
        return mapping
    except Exception as e:
        print(f"⚠️  Impossible de lire dictionary.json : {e}")
        return {}


# ──────────────────────────────────────────────────────────────────────────────
# 1. NETTOYAGE DES SYMBOLES SPÉCIAUX
# ──────────────────────────────────────────────────────────────────────────────

def clean_symbols(df: pd.DataFrame, save_path: str | None = None):
    df_str = df.fillna("").astype(str)
    results, all_symbols = [], []

    for row_idx, row in df_str.iterrows():
        for col_name, value in row.items():
            found = re.findall(_SYMBOL_PATTERN, value)
            if found:
                results.append({
                    "Ligne": row_idx,
                    "Colonne": col_name,
                    "Valeur": value,
                    "Symboles trouvés": "".join(found),
                })
                all_symbols.extend(found)

    report = pd.DataFrame(results)
    counts = (
        pd.DataFrame(Counter(all_symbols).most_common(), columns=["Symbole", "Fréquence"])
        if all_symbols
        else pd.DataFrame(columns=["Symbole", "Fréquence"])
    )
    symbols_list = counts["Symbole"].tolist()
    cleaned_df = df_str.map(lambda x: re.sub(_SYMBOL_PATTERN, "", x))

    if save_path:
        cleaned_df.to_excel(save_path, index=False)
        print(f"✅ DataFrame nettoyé sauvegardé → {save_path}")

    return cleaned_df, report, counts, symbols_list


# ──────────────────────────────────────────────────────────────────────────────
# 2. PARSING DES AFFILIATIONS (multi-org, liste Python, CSV)
# ──────────────────────────────────────────────────────────────────────────────

def parse_affiliation(x) -> list[str]:
    """
    Convertit une valeur en liste propre d'affiliations.
    Gère : listes Python sérialisées, chaînes séparées par ; | / et virgules.
    """
    if isinstance(x, list):
        # Chaque élément peut lui-même contenir des multi-org
        result = []
        for item in x:
            result.extend(parse_affiliation(item))
        return result

    if not isinstance(x, str):
        return [str(x).strip()]

    x = x.strip()
    if not x or x.lower() in ("nan", "none", ""):
        return []

    # Cas 1 : vraie liste Python sérialisée ['A', 'B', ...]
    if x.startswith("[") and x.endswith("]"):
        try:
            parsed = ast.literal_eval(x)
            if isinstance(parsed, list):
                items = [str(e).strip() for e in parsed if str(e).strip()]
                # Chaque item peut encore contenir des multi-org
                result = []
                for item in items:
                    result.extend(_split_multi_org(item))
                return result
        except Exception:
            pass

    # Cas 2 : multi-org avec séparateurs forts (; | espace/espace)
    parts = _split_multi_org(x)
    if len(parts) > 1:
        return parts

    # Cas 3 : chaîne séparée par des virgules (sans crochets)
    items = [s.strip().strip("'").strip('"') for s in x.split(",") if s.strip()]
    return items if items else [x]


def _split_multi_org(text: str) -> list[str]:
    """Sépare une chaîne contenant plusieurs organisations."""
    parts = _MULTI_SEP.split(text)
    cleaned = [p.strip().strip("'\"") for p in parts if p.strip()]
    return cleaned if cleaned else [text.strip()]


# ──────────────────────────────────────────────────────────────────────────────
# 3. NORMALISATION TEXTUELLE (Unicode + abréviations + multilingue)
# ──────────────────────────────────────────────────────────────────────────────

def normalize_text(text: str) -> str:
    """Mise en minuscules, suppression des accents, ponctuation → matching."""
    if not isinstance(text, str):
        text = str(text)
    text = text.lower().strip()
    text = "".join(
        c for c in unicodedata.normalize("NFD", text)
        if unicodedata.category(c) != "Mn"
    )
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return " ".join(text.split())


def expand_abbreviations(text: str) -> str:
    """Développe les abréviations courantes dans une affiliation."""
    for pattern, replacement in ABBREVIATIONS.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


def pivot_language(text: str) -> str:
    """Traduit les termes institutionnels vers l'anglais (forme pivot)."""
    for pattern, replacement in MULTILINGUAL.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


def normalize_affiliation(text: str) -> str:
    """
    Pipeline de normalisation complet :
    unidecode → expand abbr → pivot langue → normalize_text
    """
    if not isinstance(text, str):
        text = str(text)
    if HAS_UNIDECODE:
        text = unidecode(text)
    text = expand_abbreviations(text)
    text = pivot_language(text)
    return normalize_text(text)


# ──────────────────────────────────────────────────────────────────────────────
# 4. CLASSIFICATION HIÉRARCHIQUE
# ──────────────────────────────────────────────────────────────────────────────

def classify_level(text: str) -> str:
    """Retourne 'primary', 'department', 'hospital' ou 'other'."""
    t = text.lower()
    if re.search(_LEVEL_HOSPITAL, t):
        return "hospital"
    if re.search(_LEVEL_PRIMARY, t):
        return "primary"
    if re.search(_LEVEL_DEPT, t):
        return "department"
    return "other"


# ──────────────────────────────────────────────────────────────────────────────
# 5. RÉSOLUTION VIA DICTIONNAIRE (statique + web)
# ──────────────────────────────────────────────────────────────────────────────

# Mapping statique pré-normalisé
_STATIC_NORM: dict[str, str] = {
    normalize_text(k): v for k, v in AFFILIATION_MAPPING.items()
}


def build_combined_mapping(web_dict: dict[str, str]) -> dict[str, str]:
    """Fusionne le mapping statique et le dictionnaire web (web prioritaire)."""
    combined = dict(_STATIC_NORM)   # copie du statique
    combined.update(web_dict)       # web écrase si même clé
    return combined


def resolve_affiliation(aff: str, mapping: dict[str, str]) -> tuple[str, float]:
    """
    Résout une affiliation via le dictionnaire combiné.
    Retourne (nom_canonique, score) — score=1.0 si trouvé, sinon (aff, 0.0).
    Priorité aux correspondances les plus spécifiques (clés les plus longues).
    """
    if not isinstance(aff, str) or not aff.strip():
        return aff, 0.0

    aff_norm = normalize_affiliation(aff)

    for key_norm in sorted(mapping, key=len, reverse=True):
        if key_norm and key_norm in aff_norm:
            return mapping[key_norm], 1.0

    return aff.strip(), 0.0


# ──────────────────────────────────────────────────────────────────────────────
# 6. FUZZY MATCHING EN 3 PASSES
# ──────────────────────────────────────────────────────────────────────────────

class FuzzyMatcher:
    """
    Moteur de fuzzy matching en 3 passes :
      Passe 1 : TF-IDF cosine (rapide, ~O(n log n))
      Passe 2 : Levenshtein token_set_ratio (précis pour typos)
      Passe 3 : Sentence embeddings multilingues (fr/en/es)

    Usage :
      matcher = FuzzyMatcher(canonical_list, threshold=0.82)
      result  = matcher.match("Universit Paris Sorbonne")
      # → {"canonical": "Université Paris-Sorbonne", "score": 0.91, "method": "tfidf"}
    """

    def __init__(self, canonical_list: list[str], threshold: float = 0.82, use_sbert: bool = True):
        self.threshold = threshold
        self.originals = canonical_list
        self.normalized = [normalize_affiliation(c) for c in canonical_list]
        self._tfidf_matrix = None
        self._vectorizer = None
        self._embeddings = None
        self._sbert_model = None

        if HAS_SKLEARN and len(canonical_list) > 0:
            self._build_tfidf()
        if HAS_SBERT and use_sbert and len(canonical_list) > 0:
            self._build_sbert()

    def _build_tfidf(self):
        self._vectorizer = TfidfVectorizer(
            analyzer="char_wb", ngram_range=(2, 4), min_df=1
        )
        self._tfidf_matrix = self._vectorizer.fit_transform(self.normalized)

    def _build_sbert(self):
        try:
            print("   🔄 Chargement du modèle SBERT multilingue…")
            self._sbert_model = SentenceTransformer(
                "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
            )
            self._embeddings = self._sbert_model.encode(
                self.originals, show_progress_bar=False, batch_size=64
            )
            print("   ✅ Modèle SBERT prêt")
        except Exception as e:
            print(f"   ⚠️  SBERT non disponible : {e}")
            self._sbert_model = None

    def match(self, query: str) -> dict | None:
        """
        Tente les 3 passes dans l'ordre.
        Retourne None si aucun match dépasse le seuil.
        """
        if not self.originals:
            return None

        query_norm = normalize_affiliation(query)

        # Passe 1 : TF-IDF
        result = self._match_tfidf(query_norm)
        if result and result["score"] >= self.threshold:
            return result

        # Passe 2 : Levenshtein
        result2 = self._match_levenshtein(query_norm)
        if result2 and result2["score"] >= self.threshold:
            # Garde le meilleur des deux
            if result is None or result2["score"] > result["score"]:
                result = result2

        if result and result["score"] >= self.threshold:
            return result

        # Passe 3 : SBERT (seulement si les deux premières ont échoué)
        if self._sbert_model is not None:
            result3 = self._match_sbert(query)
            if result3 and result3["score"] >= self.threshold:
                if result is None or result3["score"] > result["score"]:
                    result = result3

        if result and result["score"] >= self.threshold:
            return result

        return None

    def _match_tfidf(self, query_norm: str) -> dict | None:
        if self._vectorizer is None:
            return None
        try:
            vec = self._vectorizer.transform([query_norm])
            sims = cosine_similarity(vec, self._tfidf_matrix)[0]
            idx = int(np.argmax(sims))
            score = float(sims[idx])
            return {
                "canonical": self.originals[idx],
                "score": round(score, 4),
                "method": "tfidf",
            }
        except Exception:
            return None

    def _match_levenshtein(self, query_norm: str) -> dict | None:
        if not HAS_RAPIDFUZZ:
            return None
        try:
            match = rfprocess.extractOne(
                query_norm,
                self.normalized,
                scorer=fuzz.token_set_ratio,
                score_cutoff=0,
            )
            if match is None:
                return None
            matched_norm, raw_score, idx = match
            score = raw_score / 100.0
            return {
                "canonical": self.originals[idx],
                "score": round(score, 4),
                "method": "levenshtein",
            }
        except Exception:
            return None

    def _match_sbert(self, query: str) -> dict | None:
        if self._sbert_model is None:
            return None
        try:
            q_emb = self._sbert_model.encode([query], show_progress_bar=False)
            sims = cosine_similarity(q_emb, self._embeddings)[0]
            idx = int(np.argmax(sims))
            score = float(sims[idx])
            return {
                "canonical": self.originals[idx],
                "score": round(score, 4),
                "method": "sbert",
            }
        except Exception:
            return None

    def match_batch(self, queries: list[str], verbose: bool = True) -> list[dict | None]:
        """Traite une liste en batch avec affichage de progression."""
        results = []
        n = len(queries)
        for i, q in enumerate(queries):
            if verbose and i % 200 == 0:
                print(f"   Fuzzy: {i}/{n}…")
            results.append(self.match(q))
        return results


# ──────────────────────────────────────────────────────────────────────────────
# 7. FILTRAGE PRIMARY / DEPT
# ──────────────────────────────────────────────────────────────────────────────

def _contains(text, pattern: str) -> bool:
    return bool(re.search(pattern, str(text), re.IGNORECASE))


def _affil_contains(aff, pattern: str) -> bool:
    if isinstance(aff, list):
        return any(_contains(a, pattern) for a in aff)
    return _contains(aff, pattern)


def filter_keep(row) -> bool:
    aff    = row.get("Affiliation", "")
    author = str(row.get("Author", ""))
    is_primary = _affil_contains(aff, _PRIMARY_KW)
    is_dept    = _affil_contains(aff, _DEPT_KW)
    author_is_primary = _contains(author, _PRIMARY_KW)
    return is_primary or (is_dept and not author_is_primary)


# ──────────────────────────────────────────────────────────────────────────────
# 8. PIPELINE PRINCIPAL
# ──────────────────────────────────────────────────────────────────────────────

def run_pipeline(
    input_path: str,
    output_path: str,
    *,
    dict_path: str | None = None,
    use_fuzzy: bool = True,
    fuzzy_threshold: float = 0.82,
    use_sbert: bool = True,
    save_cleaned: bool = True,
    save_failed: bool = True,
    apply_filter: bool = True,
    verbose: bool = True,
) -> pd.DataFrame:
    """
    Exécute le pipeline complet de nettoyage et fusion des affiliations.

    Paramètres
    ----------
    input_path       : chemin vers le fichier Excel d'entrée
    output_path      : chemin vers le fichier Excel de sortie final
    dict_path        : chemin vers dictionary.json (défaut : auto-détection)
    use_fuzzy        : activer le fuzzy matching (TF-IDF + Levenshtein + SBERT)
    fuzzy_threshold  : seuil de confiance minimal pour accepter un match (0–1)
    use_sbert        : activer les embeddings SBERT multilingues
    save_cleaned     : sauvegarder l'étape intermédiaire nettoyée
    save_failed      : exporter la liste des affiliations non résolues
    apply_filter     : appliquer le filtre primary/dept
    verbose          : afficher les logs
    """

    def log(msg):
        if verbose:
            print(msg)

    # ── Chargement ───────────────────────────────────────────────────────────
    log(f"📂 Chargement : {input_path}")
    data = pd.read_excel(input_path)
    log(f"   {len(data)} lignes, colonnes : {list(data.columns)}")

    # ── Chargement du dictionnaire web ───────────────────────────────────────
    web_dict = load_web_dictionary(dict_path)
    combined_mapping = build_combined_mapping(web_dict)
    log(f"   Mapping total : {len(combined_mapping)} entrées (statique + web)")

    # ── Étape 1 : nettoyage des symboles ─────────────────────────────────────
    log("\n🔤 Étape 1 — Nettoyage des symboles spéciaux")
    cleaned_path = output_path.replace(".xlsx", "_step1_cleaned.xlsx") if save_cleaned else None
    data_cleaned, report, counts, symbols = clean_symbols(data, save_path=cleaned_path)

    for col in ["Normalized Affiliation", "Standard Affiliation",
                "Affiliation_Resolved", "Affil_Pivot", "Affil_Level", "Match_Score", "Match_Method"]:
        if col in data_cleaned.columns:
            data_cleaned.drop(columns=col, inplace=True)

    data_cleaned = data_cleaned[
        data_cleaned["Affiliation"].notna()
        & (data_cleaned["Affiliation"].str.strip().isin(["", "nan"]) == False)
    ].copy()

    log(f"   Symboles supprimés ({len(symbols)}) : {symbols[:10]}{'...' if len(symbols)>10 else ''}")
    log(f"   Rapport : {len(report)} cellules concernées")

    # ── Étape 2 : parsing + explosion ────────────────────────────────────────
    log("\n📋 Étape 2 — Parsing et explosion des affiliations (multi-org ; | /)")
    data_cleaned["Affiliation"] = data_cleaned["Affiliation"].apply(parse_affiliation)
    data_exploded = data_cleaned.explode("Affiliation").reset_index(drop=True)

    # Nettoyage post-explosion
    data_exploded["Affiliation"] = (
        data_exploded["Affiliation"]
        .astype(str)
        .str.replace(r"\(.*?\)", "", regex=True)
        .str.strip()
    )

    # Suppression des doublons stricts (Year + Title + Affiliation)
    dedup_cols = [c for c in ["Year", "Title", "Affiliation"] if c in data_exploded.columns]
    data_exploded = data_exploded.drop_duplicates(subset=dedup_cols).reset_index(drop=True)

    # Suppression des affiliations vides
    data_exploded = data_exploded[
        data_exploded["Affiliation"].notna()
        & (data_exploded["Affiliation"].str.strip() != "")
        & (data_exploded["Affiliation"].str.strip().str.lower() != "nan")
    ].reset_index(drop=True)

    log(f"   {len(data_exploded)} lignes après explosion")

    # ── Étape 3 : normalisation Unicode + abréviations + langue pivot ─────────
    log("\n🔡 Étape 3 — Normalisation (Unicode, abréviations, pivot multilingue)")

    # On conserve l'original pour l'export
    data_exploded["Affil_Original"] = data_exploded["Affiliation"].astype(str)

    # Forme pivot (développement abbr + langue)
    data_exploded["Affil_Pivot"] = (
        data_exploded["Affiliation"]
        .apply(lambda x: unidecode(str(x)) if HAS_UNIDECODE else str(x))
        .apply(expand_abbreviations)
        .apply(pivot_language)
        .str.strip()
        .apply(lambda x: re.sub(r"\s+", " ", x))
    )

    # Normalisation finale (minuscules, sans ponctuation) — pour le matching
    data_exploded["Affil_Norm"] = data_exploded["Affil_Pivot"].apply(normalize_text)

    # Classification hiérarchique
    data_exploded["Affil_Level"] = data_exploded["Affil_Pivot"].apply(classify_level)
    log(f"   Niveaux : {data_exploded['Affil_Level'].value_counts().to_dict()}")

    # ── Étape 4 : résolution via dictionnaire ─────────────────────────────────
    log("\n🗺️  Étape 4 — Résolution via dictionnaire combiné")

    resolved_names, resolved_scores = [], []
    for aff in data_exploded["Affil_Original"]:
        name, score = resolve_affiliation(aff, combined_mapping)
        resolved_names.append(name)
        resolved_scores.append(score)

    data_exploded["Affiliation_Resolved"] = resolved_names
    data_exploded["Match_Score"] = resolved_scores
    data_exploded["Match_Method"] = [
        "dictionary" if s == 1.0 else "unresolved" for s in resolved_scores
    ]

    n_dict = (data_exploded["Match_Score"] == 1.0).sum()
    n_unresolved = (data_exploded["Match_Score"] == 0.0).sum()
    log(f"   Résolues par dictionnaire : {n_dict} / {len(data_exploded)}")
    log(f"   Non résolues → fuzzy : {n_unresolved}")

    # ── Étape 5 : fuzzy matching ──────────────────────────────────────────────
    if use_fuzzy and n_unresolved > 0:
        log(f"\n🔍 Étape 5 — Fuzzy matching (seuil={fuzzy_threshold})")

        # Les canoniques du dictionnaire = cibles du fuzzy
        canonical_targets = sorted(set(combined_mapping.values()))
        log(f"   {len(canonical_targets)} cibles canoniques")

        # Vérification des dépendances
        if not HAS_SKLEARN:
            log("   ⚠️  scikit-learn absent — TF-IDF désactivé (pip install scikit-learn)")
        if not HAS_RAPIDFUZZ:
            log("   ⚠️  rapidfuzz absent — Levenshtein désactivé (pip install rapidfuzz)")
        if not HAS_SBERT:
            log("   ⚠️  sentence-transformers absent — SBERT désactivé (pip install sentence-transformers)")

        if HAS_SKLEARN or HAS_RAPIDFUZZ or HAS_SBERT:
            matcher = FuzzyMatcher(
                canonical_targets,
                threshold=fuzzy_threshold,
                use_sbert=use_sbert and HAS_SBERT,
            )

            unresolved_mask = data_exploded["Match_Score"] == 0.0
            unresolved_affils = data_exploded.loc[unresolved_mask, "Affil_Original"].tolist()

            matches = matcher.match_batch(unresolved_affils, verbose=verbose)

            # Mise à jour
            indices = data_exploded.index[unresolved_mask].tolist()
            n_fuzzy_matched = 0
            for idx, match in zip(indices, matches):
                if match is not None:
                    data_exploded.at[idx, "Affiliation_Resolved"] = match["canonical"]
                    data_exploded.at[idx, "Match_Score"] = match["score"]
                    data_exploded.at[idx, "Match_Method"] = match["method"]
                    n_fuzzy_matched += 1

            log(f"   Fuzzy : {n_fuzzy_matched} affiliations résolues supplémentaires")
        else:
            log("   ⚠️  Aucune bibliothèque fuzzy disponible — étape ignorée")
    elif not use_fuzzy:
        log("\n⏭️  Étape 5 — Fuzzy matching désactivé (--no-fuzzy)")

    # ── Étape 6 : filtrage primary / dept ────────────────────────────────────
    if apply_filter:
        log("\n🔍 Étape 6 — Filtrage primary / dept")
        data_exploded["_keep"] = data_exploded.apply(filter_keep, axis=1)
        data_final = data_exploded[data_exploded["_keep"]].copy()
        data_failed = data_exploded[~data_exploded["_keep"]].copy()
        data_final.drop(columns="_keep", inplace=True)
        data_failed.drop(columns="_keep", inplace=True)
        log(f"   Conservées : {len(data_final)}, Rejetées : {len(data_failed)}")
    else:
        data_final = data_exploded.copy()
        data_failed = pd.DataFrame()
        log("\n⚠️  Étape 6 — Filtrage désactivé")

    # ── Export des affiliations non résolues ─────────────────────────────────
    if save_failed:
        still_unresolved = data_final[data_final["Match_Score"] == 0.0]
        if len(still_unresolved) > 0:
            failed_path = output_path.replace(".xlsx", "_unresolved.xlsx")
            failed_unique = (
                still_unresolved[["Affil_Original", "Affil_Pivot", "Affil_Level"]]
                .drop_duplicates()
                .assign(Count=still_unresolved.groupby("Affil_Original")["Affil_Original"].transform("count"))
                .drop_duplicates("Affil_Original")
                .sort_values("Count", ascending=False)
                .reset_index(drop=True)
            )
            failed_unique.to_excel(failed_path, index=False)
            log(f"\n💾 Non résolues ({len(failed_unique)} uniques) → {failed_path}")

    # ── Export final enrichi ──────────────────────────────────────────────────
    # Colonnes disponibles → on sélectionne ce qui existe
    base_cols = ["Year", "Title", "Author"]
    export_cols = [c for c in base_cols if c in data_final.columns]
    export_cols += ["Affil_Original", "Affiliation_Resolved", "Affil_Pivot", "Affil_Level", "Match_Score", "Match_Method"]
    export_cols = [c for c in export_cols if c in data_final.columns]

    data_out = data_final[export_cols].copy()
    data_out = data_out.rename(columns={
        "Affil_Original": "Affiliation_Originale",
        "Affiliation_Resolved": "Affiliation_Normalisee",
        "Affil_Pivot": "Affiliation_Pivot",
        "Affil_Level": "Niveau_Hierarchique",
        "Match_Score": "Score_Confiance",
        "Match_Method": "Methode_Resolution",
    })
    data_out = data_out.drop_duplicates().reset_index(drop=True)
    data_out.to_excel(output_path, index=False)
    log(f"\n✅ Résultat final ({len(data_out)} lignes) → {output_path}")

    # ── Statistiques ──────────────────────────────────────────────────────────
    if verbose:
        print("\n📊 Top 15 affiliations normalisées :")
        print(data_out["Affiliation_Normalisee"].value_counts().head(15).to_string())
        print("\n📊 Méthodes de résolution :")
        if "Methode_Resolution" in data_out.columns:
            print(data_out["Methode_Resolution"].value_counts().to_string())
        print("\n📊 Scores de confiance :")
        scores = data_out["Score_Confiance"].dropna()
        print(f"   Moyenne : {scores.mean():.3f}  |  Médiane : {scores.median():.3f}")
        print(f"   ≥ 0.92 (auto) : {(scores >= 0.92).sum()}  |  0.75–0.91 (révision) : {((scores >= 0.75) & (scores < 0.92)).sum()}  |  < 0.75 (manuel) : {(scores < 0.75).sum()}")

    return data_out


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Pipeline de nettoyage et fusion des affiliations académiques."
    )
    parser.add_argument("--input",  "-i", required=True,
        help="Fichier Excel d'entrée (ex: affil_normalize.xlsx)")
    parser.add_argument("--output", "-o", default="affiliation_merged.xlsx",
        help="Fichier Excel de sortie (défaut: affiliation_merged.xlsx)")
    parser.add_argument("--dict",   "-d", default=None,
        help="Chemin vers dictionary.json (défaut: auto-détection)")
    parser.add_argument("--fuzzy",  action="store_true", default=True,
        help="Activer le fuzzy matching (défaut: activé)")
    parser.add_argument("--no-fuzzy", action="store_true",
        help="Désactiver le fuzzy matching")
    parser.add_argument("--threshold", "-t", type=float, default=0.82,
        help="Seuil de confiance fuzzy 0–1 (défaut: 0.82)")
    parser.add_argument("--no-sbert", action="store_true",
        help="Désactiver les embeddings SBERT (plus rapide, moins précis)")
    parser.add_argument("--no-filter", action="store_true",
        help="Désactiver le filtrage primary/dept")
    parser.add_argument("--no-failed", action="store_true",
        help="Ne pas exporter les affiliations non résolues")
    parser.add_argument("--quiet",  "-q", action="store_true",
        help="Mode silencieux")

    args = parser.parse_args()

    run_pipeline(
        input_path=args.input,
        output_path=args.output,
        dict_path=args.dict,
        use_fuzzy=not args.no_fuzzy,
        fuzzy_threshold=args.threshold,
        use_sbert=not args.no_sbert,
        apply_filter=not args.no_filter,
        save_failed=not args.no_failed,
        verbose=not args.quiet,
    )