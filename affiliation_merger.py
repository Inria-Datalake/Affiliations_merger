"""
affiliation_merger.py
=====================
Pipeline complet de nettoyage, normalisation et fusion des affiliations académiques.

Étapes :
  1. Nettoyage des symboles spéciaux + rapport
  2. Parsing des listes d'affiliations (explosion)
  3. Normalisation (accents, ponctuation)
  4. Mapping canonique via dictionnaire (matching par inclusion)
  5. Filtrage primary / dept
  6. Export des affiliations non résolues pour enrichissement futur

Usage :
  python affiliation_merger.py --input affil_normalize.xlsx --output result.xlsx
"""

import argparse
import ast
import re
import unicodedata
from collections import Counter

import pandas as pd
from unidecode import unidecode


# ──────────────────────────────────────────────────────────────────────────────
# 1. NETTOYAGE DES SYMBOLES SPÉCIAUX
# ──────────────────────────────────────────────────────────────────────────────

# Caractères autorisés dans une affiliation (lettres, chiffres, espaces, ponctuation utile)
_SYMBOL_PATTERN = r"[^\w\s.,;:!?()\"\'/\-]"


def clean_symbols(df: pd.DataFrame, save_path: str | None = None):
    """
    Détecte et supprime tous les symboles spéciaux dans un DataFrame.

    Retourne
    --------
    cleaned_df   : pd.DataFrame  — DataFrame nettoyé
    report       : pd.DataFrame  — lignes contenant des symboles (Ligne, Colonne, Valeur, Symboles)
    counts       : pd.DataFrame  — fréquence des symboles supprimés
    symbols_list : list[str]     — symboles uniques rencontrés
    """
    df_str = df.astype(str)

    results, all_symbols = [], []

    for row_idx, row in df_str.iterrows():
        for col_name, value in row.items():
            found = re.findall(_SYMBOL_PATTERN, value)
            if found:
                results.append(
                    {
                        "Ligne": row_idx,
                        "Colonne": col_name,
                        "Valeur": value,
                        "Symboles trouvés": "".join(found),
                    }
                )
                all_symbols.extend(found)

    report = pd.DataFrame(results)
    counts = (
        pd.DataFrame(
            Counter(all_symbols).most_common(), columns=["Symbole", "Fréquence"]
        )
        if all_symbols
        else pd.DataFrame(columns=["Symbole", "Fréquence"])
    )
    symbols_list = counts["Symbole"].tolist()

    # Nettoyage global (plus rapide qu'un remplacement symbole par symbole)
    cleaned_df = df_str.map(lambda x: re.sub(_SYMBOL_PATTERN, "", x))

    if save_path:
        cleaned_df.to_excel(save_path, index=False)
        print(f"✅ DataFrame nettoyé sauvegardé → {save_path}")

    return cleaned_df, report, counts, symbols_list


# ──────────────────────────────────────────────────────────────────────────────
# 2. PARSING DES AFFILIATIONS (liste Python ou chaîne CSV)
# ──────────────────────────────────────────────────────────────────────────────

def parse_affiliation(x) -> list[str]:
    """Convertit une valeur (str, list, autre) en liste propre d'affiliations."""
    if isinstance(x, list):
        return x
    if not isinstance(x, str):
        return [str(x)]

    x = x.strip()

    # Cas 1 : vraie liste Python sérialisée  ['A', 'B', ...]
    if x.startswith("[") and x.endswith("]"):
        try:
            parsed = ast.literal_eval(x)
            if isinstance(parsed, list):
                return [str(e).strip() for e in parsed if str(e).strip()]
        except Exception:
            pass  # on tombe sur le fallback

    # Cas 2 : chaîne séparée par des virgules (sans crochets)
    items = [s.strip().strip("'").strip('"') for s in x.split(",") if s.strip()]
    return items if items else [x]


# ──────────────────────────────────────────────────────────────────────────────
# 3. NORMALISATION TEXTUELLE
# ──────────────────────────────────────────────────────────────────────────────

def normalize_text(text: str) -> str:
    """
    Mise en minuscules, suppression des accents et de la ponctuation.
    Conserve lettres, chiffres et espaces pour le matching.
    """
    if not isinstance(text, str):
        text = str(text)
    text = text.lower().strip()
    # Décomposition Unicode puis suppression des marques diacritiques
    text = "".join(
        c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn"
    )
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return " ".join(text.split())


# ──────────────────────────────────────────────────────────────────────────────
# 4. DICTIONNAIRE DE MAPPING CANONIQUE
# ──────────────────────────────────────────────────────────────────────────────

# Clé   → fragment présent dans l'affiliation normalisée (matching par inclusion)
# Valeur → nom canonique affiché dans les résultats
#
# ORDRE IMPORTANT : les clés plus spécifiques doivent précéder les clés génériques.
# Par ex. "google deepmind" avant "google", "facebook ai research" avant "facebook".

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

    # ── Samsung ──────────────────────────────────────────────────────────────
    "samsung": "Samsung",

    # ── ByteDance ────────────────────────────────────────────────────────────
    "bytedance research": "ByteDance",
    "bytedance": "ByteDance",

    # ── Tencent ──────────────────────────────────────────────────────────────
    "tencent": "Tencent",

    # ── Bosch ────────────────────────────────────────────────────────────────
    "bosch research": "Bosch",
    "bosch": "Bosch",

    # ── Intel ────────────────────────────────────────────────────────────────
    "intel labs": "Intel",
    "intel": "Intel",

    # ── Adobe ────────────────────────────────────────────────────────────────
    "adobe research": "Adobe",
    "adobe": "Adobe",

    # ── Salesforce ───────────────────────────────────────────────────────────
    "salesforce research": "Salesforce",
    "salesforce": "Salesforce",

    # ── Uber ─────────────────────────────────────────────────────────────────
    "uber ai": "Uber",
    "uber": "Uber",

    # ── Snap ─────────────────────────────────────────────────────────────────
    "snap": "Snap",

    # ── Twitter / X ──────────────────────────────────────────────────────────
    "twitter": "Twitter (X)",
    "x corp": "Twitter (X)",

    # ── LinkedIn ─────────────────────────────────────────────────────────────
    "linkedin": "LinkedIn",

    # ── Cohere ───────────────────────────────────────────────────────────────
    "cohere for ai": "Cohere",
    "cohere": "Cohere",

    # ── Hugging Face ─────────────────────────────────────────────────────────
    "hugging face": "Hugging Face",

    # ── Element AI ───────────────────────────────────────────────────────────
    "element ai": "Element AI",

    # ── Ant Financial ────────────────────────────────────────────────────────
    "ant financial": "Ant Financial",
    "ant group": "Ant Financial",

    # ─────────────────────────────────────────────────────────────────────────
    # UNIVERSITÉS
    # ─────────────────────────────────────────────────────────────────────────

    # ── MIT ──────────────────────────────────────────────────────────────────
    "massachusetts institute of technology": "MIT",
    "csail": "MIT",
    "mit": "MIT",

    # ── Stanford ─────────────────────────────────────────────────────────────
    "stanford": "Stanford University",

    # ── Berkeley ─────────────────────────────────────────────────────────────
    "uc berkeley": "UC Berkeley",
    "berkeley ai research": "UC Berkeley",
    "university of california berkeley": "UC Berkeley",
    "berkeley": "UC Berkeley",

    # ── UC San Diego ─────────────────────────────────────────────────────────
    "uc san diego": "UC San Diego",
    "ucsd": "UC San Diego",

    # ── UCLA ─────────────────────────────────────────────────────────────────
    "ucla": "UCLA",
    "uc los angeles": "UCLA",

    # ── University of California (générique) ─────────────────────────────────
    "university of california": "University of California",

    # ── CMU ──────────────────────────────────────────────────────────────────
    "carnegie mellon": "Carnegie Mellon University",
    "cmu": "Carnegie Mellon University",

    # ── Cornell ──────────────────────────────────────────────────────────────
    "cornell": "Cornell University",

    # ── Princeton ────────────────────────────────────────────────────────────
    "princeton": "Princeton University",

    # ── Yale ─────────────────────────────────────────────────────────────────
    "yale": "Yale University",

    # ── Columbia ─────────────────────────────────────────────────────────────
    "columbia": "Columbia University",

    # ── Harvard ──────────────────────────────────────────────────────────────
    "harvard": "Harvard University",

    # ── NYU ──────────────────────────────────────────────────────────────────
    "new york university": "NYU",
    "nyu": "NYU",

    # ── University of Washington ─────────────────────────────────────────────
    "university of washington": "University of Washington",

    # ── University of Toronto ────────────────────────────────────────────────
    "university of toronto": "University of Toronto",
    "uoft": "University of Toronto",

    # ── University of Michigan ───────────────────────────────────────────────
    "university of michigan": "University of Michigan",
    "umich": "University of Michigan",

    # ── University of Oxford ─────────────────────────────────────────────────
    "university of oxford": "University of Oxford",
    "oxford": "University of Oxford",

    # ── University of Cambridge ──────────────────────────────────────────────
    "university of cambridge": "University of Cambridge",
    "cambridge": "University of Cambridge",

    # ── UCL ──────────────────────────────────────────────────────────────────
    "university college london": "UCL",
    "gatsby unit": "UCL",
    "ucl": "UCL",

    # ── Imperial College ─────────────────────────────────────────────────────
    "imperial college": "Imperial College London",

    # ── Georgia Tech ─────────────────────────────────────────────────────────
    "georgia tech": "Georgia Tech",
    "georgia institute of technology": "Georgia Tech",

    # ── Caltech ──────────────────────────────────────────────────────────────
    "caltech": "Caltech",
    "california institute of technology": "Caltech",

    # ── UT Austin ────────────────────────────────────────────────────────────
    "university of texas at austin": "UT Austin",
    "ut austin": "UT Austin",

    # ── University of Alberta ────────────────────────────────────────────────
    "university of alberta": "University of Alberta",

    # ── McGill ───────────────────────────────────────────────────────────────
    "mcgill": "McGill University",

    # ── Mila ─────────────────────────────────────────────────────────────────
    "mila": "Mila",

    # ── KAIST ────────────────────────────────────────────────────────────────
    "kaist": "KAIST",

    # ── POSTECH ──────────────────────────────────────────────────────────────
    "postech": "POSTECH",

    # ── HKUST ────────────────────────────────────────────────────────────────
    "hkust": "HKUST",

    # ── Tsinghua ─────────────────────────────────────────────────────────────
    "tsinghua": "Tsinghua University",

    # ── Peking University ────────────────────────────────────────────────────
    "peking university": "Peking University",

    # ── ETH Zurich ───────────────────────────────────────────────────────────
    "eth zurich": "ETH Zurich",
    "eth zurich": "ETH Zurich",
    "eth": "ETH Zurich",

    # ── EPFL ─────────────────────────────────────────────────────────────────
    "ecole polytechnique federale de lausanne": "EPFL",
    "epfl": "EPFL",

    # ── Polytechnique Montréal ───────────────────────────────────────────────
    "polytechnique montreal": "Polytechnique Montréal",
    "polytechnique montréal": "Polytechnique Montréal",

    # ── Sorbonne / PSL ───────────────────────────────────────────────────────
    "sorbonne": "Université Paris-Sorbonne",
    "psl": "PSL University",

    # ── ENS ──────────────────────────────────────────────────────────────────
    "ens paris": "ENS Paris",
    "ecole normale superieure": "ENS Paris",
    "ens": "ENS",

    # ── KU Leuven ────────────────────────────────────────────────────────────
    "ku leuven": "KU Leuven",

    # ── University of Edinburgh ──────────────────────────────────────────────
    "university of edinburgh": "University of Edinburgh",
    "edinburgh": "University of Edinburgh",

    # ── Alan Turing Institute ────────────────────────────────────────────────
    "alan turing institute": "Alan Turing Institute",

    # ── University of Warwick ────────────────────────────────────────────────
    "university of warwick": "University of Warwick",
    "warwick": "University of Warwick",

    # ── Sharif University ────────────────────────────────────────────────────
    "sharif university": "Sharif University",

    # ── IIT ──────────────────────────────────────────────────────────────────
    "iit bombay": "IIT Bombay",
    "iit delhi": "IIT Delhi",
    "iit kharagpur": "IIT Kharagpur",
    "iit madras": "IIT Madras",
    "iit kanpur": "IIT Kanpur",
    "iit": "IIT",

    # ─────────────────────────────────────────────────────────────────────────
    # INSTITUTS / ORGANISMES DE RECHERCHE
    # ─────────────────────────────────────────────────────────────────────────

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
    "epfl": "EPFL",
    "ist austria": "ISTA",
    "ista": "ISTA",
    "conicet": "CONICET",
    "aist": "AIST",
    "a star": "A*STAR",
    "agency for science technology and research": "A*STAR",

    # Écoles françaises
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

    # Divers
    "siemens": "Siemens",
    "sony": "Sony",
    "philips": "Philips",
    "thales": "Thales",
    "ericsson": "Ericsson",
    "oracle": "Oracle",
    "qualcomm": "Qualcomm",
    "graphcore": "Graphcore",
    "waymo": "Waymo",
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "deepl": "DeepL",
}

# Pré-calcul des clés normalisées une seule fois au chargement
_MAPPING_NORM: dict[str, str] = {
    normalize_text(k): v for k, v in AFFILIATION_MAPPING.items()
}


def resolve_affiliation(aff: str) -> str:
    """
    Tente de résoudre une affiliation vers son nom canonique.
    Parcours les clés du plus long au plus court pour éviter les faux positifs.
    """
    if not isinstance(aff, str) or not aff.strip():
        return aff

    aff_norm = normalize_text(aff)

    # Tri décroissant par longueur de clé → priorité aux correspondances spécifiques
    for key_norm in sorted(_MAPPING_NORM, key=len, reverse=True):
        if key_norm in aff_norm:
            return _MAPPING_NORM[key_norm]

    return aff.strip()


# ──────────────────────────────────────────────────────────────────────────────
# 5. FILTRAGE PRIMARY / DEPT
# ──────────────────────────────────────────────────────────────────────────────

_PRIMARY_KW = r"univ|instit|istitut|cnrs|group|company|academy|college|ecole|facult|laboratory|laborator"
_DEPT_KW    = r"department|dept|departement|laboratoire|lab\b|cent|umr|school"


def _contains(text, pattern: str) -> bool:
    return bool(re.search(pattern, str(text), re.IGNORECASE))


def _affil_contains(aff, pattern: str) -> bool:
    if isinstance(aff, list):
        return any(_contains(a, pattern) for a in aff)
    return _contains(aff, pattern)


def filter_keep(row) -> bool:
    """
    Retourne True si la ligne doit être conservée.
    Logique : garder si l'affiliation contient un mot-clé "primaire" OU
    un mot-clé "département" sans que l'auteur lui-même soit une université.
    """
    aff    = row.get("Affiliation", "")
    author = str(row.get("Author", ""))
    is_primary = _affil_contains(aff, _PRIMARY_KW)
    is_dept    = _affil_contains(aff, _DEPT_KW)
    author_is_primary = _contains(author, _PRIMARY_KW)
    return is_primary or (is_dept and not author_is_primary)


# ──────────────────────────────────────────────────────────────────────────────
# 6. PIPELINE PRINCIPAL
# ──────────────────────────────────────────────────────────────────────────────

def run_pipeline(
    input_path: str,
    output_path: str,
    *,
    save_cleaned: bool = True,
    save_failed: bool = True,
    apply_filter: bool = True,
    verbose: bool = True,
) -> pd.DataFrame:
    """
    Exécute le pipeline complet de nettoyage et fusion des affiliations.

    Paramètres
    ----------
    input_path  : chemin vers le fichier Excel d'entrée
    output_path : chemin vers le fichier Excel de sortie final
    save_cleaned: sauvegarder l'étape intermédiaire nettoyée
    save_failed : exporter la liste des affiliations non résolues
    apply_filter: appliquer le filtre primary/dept
    verbose     : afficher les logs

    Retour
    ------
    DataFrame final traité.
    """

    def log(msg):
        if verbose:
            print(msg)

    # ── Chargement ───────────────────────────────────────────────────────────
    log(f"📂 Chargement : {input_path}")
    data = pd.read_excel(input_path)
    log(f"   {len(data)} lignes, colonnes : {list(data.columns)}")

    # ── Étape 1 : nettoyage des symboles ─────────────────────────────────────
    log("\n🔤 Étape 1 — Nettoyage des symboles spéciaux")
    cleaned_path = output_path.replace(".xlsx", "_step1_cleaned.xlsx") if save_cleaned else None
    data_cleaned, report, counts, symbols = clean_symbols(data, save_path=cleaned_path)

    # Supprimer les colonnes techniques héritées si elles existent
    for col in ["Normalized Affiliation", "Standard Affiliation"]:
        if col in data_cleaned.columns:
            data_cleaned.drop(columns=col, inplace=True)

    # Supprimer les lignes sans affiliation
    data_cleaned = data_cleaned[
        data_cleaned["Affiliation"].notna()
        & (data_cleaned["Affiliation"].str.strip().isin(["", "nan"]) == False)
    ].copy()

    log(f"   Symboles supprimés ({len(symbols)}) : {symbols[:10]}{'...' if len(symbols)>10 else ''}")
    log(f"   Rapport : {len(report)} cellules concernées")

    # ── Étape 2 : parsing + explosion ────────────────────────────────────────
    log("\n📋 Étape 2 — Parsing et explosion des affiliations")
    data_cleaned["Affiliation"] = data_cleaned["Affiliation"].apply(parse_affiliation)
    data_exploded = data_cleaned.explode("Affiliation").reset_index(drop=True)

    # Nettoyage post-explosion : parenthèses résiduelles et espaces
    data_exploded["Affiliation"] = (
        data_exploded["Affiliation"]
        .astype(str)
        .str.replace(r"\(.*?\)", "", regex=True)
        .str.strip()
    )

    # Suppression des doublons stricts
    data_exploded = data_exploded.drop_duplicates(
        subset=["Year", "Title", "Affiliation"]
    ).reset_index(drop=True)

    # Suppression des affiliations vides post-explosion
    data_exploded = data_exploded[
        data_exploded["Affiliation"].notna()
        & (data_exploded["Affiliation"].str.strip() != "")
        & (data_exploded["Affiliation"].str.strip() != "nan")
    ].reset_index(drop=True)

    log(f"   {len(data_exploded)} lignes après explosion")

    # ── Étape 3 : normalisation Unicode ──────────────────────────────────────
    log("\n🔡 Étape 3 — Normalisation Unicode (accents → ASCII, ponctuation)")
    data_exploded["Affiliation"] = (
        data_exploded["Affiliation"]
        .apply(lambda x: unidecode(str(x)))
        .apply(lambda x: re.sub(r"[^A-Za-z0-9\-/ ]+", " ", x))
        .str.strip()
        .apply(lambda x: re.sub(r"\s+", " ", x))
    )

    # ── Étape 4 : mapping canonique ──────────────────────────────────────────
    log("\n🗺️  Étape 4 — Résolution via dictionnaire")
    data_exploded["Affiliation_Resolved"] = data_exploded["Affiliation"].apply(
        resolve_affiliation
    )

    n_resolved = (data_exploded["Affiliation_Resolved"] != data_exploded["Affiliation"]).sum()
    log(f"   {n_resolved} affiliations résolues sur {len(data_exploded)}")

    # ── Étape 5 : filtrage primary / dept ────────────────────────────────────
    if apply_filter:
        log("\n🔍 Étape 5 — Filtrage primary / dept")
        data_exploded["_keep"] = data_exploded.apply(filter_keep, axis=1)
        data_final = data_exploded[data_exploded["_keep"]].copy()
        data_failed = data_exploded[~data_exploded["_keep"]].copy()
        data_final.drop(columns="_keep", inplace=True)
        data_failed.drop(columns="_keep", inplace=True)
        log(f"   Conservées : {len(data_final)}, Rejetées : {len(data_failed)}")
    else:
        data_final = data_exploded.copy()
        data_failed = pd.DataFrame()
        log("\n⚠️  Étape 5 — Filtrage désactivé")

    # ── Export des affiliations non résolues ─────────────────────────────────
    if save_failed and len(data_failed) > 0:
        failed_path = output_path.replace(".xlsx", "_failed_affiliations.xlsx")
        failed_unique = (
            data_failed["Affiliation"]
            .value_counts()
            .reset_index()
            .rename(columns={"index": "Affiliation", "Affiliation": "Count"})
        )
        failed_unique.to_excel(failed_path, index=False)
        log(f"\n💾 Affiliations rejetées → {failed_path}")

    # ── Export final ─────────────────────────────────────────────────────────
    cols_out = ["Year", "Title", "Author", "Affiliation_Resolved"]
    cols_out = [c for c in cols_out if c in data_final.columns]
    data_out = data_final[cols_out].rename(columns={"Affiliation_Resolved": "Affiliation"})
    data_out = data_out.drop_duplicates().reset_index(drop=True)

    data_out.to_excel(output_path, index=False)
    log(f"\n✅ Résultat final ({len(data_out)} lignes) → {output_path}")

    # ── Statistiques rapides ──────────────────────────────────────────────────
    if verbose:
        print("\n📊 Top 15 affiliations :")
        print(data_out["Affiliation"].value_counts().head(15).to_string())

    return data_out


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Pipeline de nettoyage et fusion des affiliations académiques."
    )
    parser.add_argument(
        "--input", "-i", required=True,
        help="Fichier Excel d'entrée (ex: affil_normalize.xlsx)"
    )
    parser.add_argument(
        "--output", "-o", default="affiliation_merged.xlsx",
        help="Fichier Excel de sortie (défaut: affiliation_merged.xlsx)"
    )
    parser.add_argument(
        "--no-filter", action="store_true",
        help="Désactiver le filtrage primary/dept"
    )
    parser.add_argument(
        "--no-failed", action="store_true",
        help="Ne pas exporter les affiliations non résolues"
    )
    parser.add_argument(
        "--quiet", "-q", action="store_true",
        help="Mode silencieux"
    )
    args = parser.parse_args()

    run_pipeline(
        input_path=args.input,
        output_path=args.output,
        apply_filter=not args.no_filter,
        save_failed=not args.no_failed,
        verbose=not args.quiet,
    )
