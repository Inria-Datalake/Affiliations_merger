# install_deps.ps1
# Installation des dépendances Python pour le fuzzy matching amélioré
# Usage : .\install_deps.ps1

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Affiliation Merger — Installation des deps   " -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Activation du venv
$venvActivate = Join-Path $PSScriptRoot ".venv\Scripts\Activate.ps1"
if (Test-Path $venvActivate) {
    Write-Host "✅ Activation du venv..." -ForegroundColor Green
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned -Force
    & $venvActivate
} else {
    Write-Host "⚠️  Venv non trouvé — utilisation de Python global" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📦 Installation des dépendances obligatoires..." -ForegroundColor Cyan
pip install --upgrade pip --quiet
pip install pandas openpyxl unidecode --quiet
Write-Host "✅ pandas, openpyxl, unidecode installés" -ForegroundColor Green

Write-Host ""
Write-Host "📦 Installation des dépendances fuzzy (légères)..." -ForegroundColor Cyan
pip install rapidfuzz scikit-learn numpy --quiet
Write-Host "✅ rapidfuzz, scikit-learn, numpy installés" -ForegroundColor Green

Write-Host ""
Write-Host "📦 Installation de sentence-transformers (SBERT multilingue)..." -ForegroundColor Cyan
Write-Host "   ⏳ Ce modèle pèse ~400 Mo — téléchargement en cours..." -ForegroundColor Yellow
pip install sentence-transformers torch --quiet
Write-Host "✅ sentence-transformers installé" -ForegroundColor Green

Write-Host ""
Write-Host "🔍 Vérification finale..." -ForegroundColor Cyan
python -c "
import json
deps = {}
for name, mod in [
    ('pandas',               'pandas'),
    ('openpyxl',             'openpyxl'),
    ('unidecode',            'unidecode'),
    ('rapidfuzz',            'rapidfuzz'),
    ('scikit-learn',         'sklearn'),
    ('numpy',                'numpy'),
    ('sentence-transformers','sentence_transformers'),
]:
    try:
        __import__(mod)
        deps[name] = '✅'
    except ImportError:
        deps[name] = '❌ MANQUANT'
for k, v in deps.items():
    print(f'   {v}  {k}')
"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Installation terminée !" -ForegroundColor Green
Write-Host ""
Write-Host "  Commandes disponibles :" -ForegroundColor White
Write-Host ""
Write-Host "  # Pipeline complet avec fuzzy matching :" -ForegroundColor Gray
Write-Host "  python affiliation_merger.py --input affil_normalize.xlsx --output result.xlsx --fuzzy" -ForegroundColor Yellow
Write-Host ""
Write-Host "  # Sans SBERT (plus rapide) :" -ForegroundColor Gray
Write-Host "  python affiliation_merger.py --input affil_normalize.xlsx --output result.xlsx --fuzzy --no-sbert" -ForegroundColor Yellow
Write-Host ""
Write-Host "  # Seuil personnalisé :" -ForegroundColor Gray
Write-Host "  python affiliation_merger.py --input affil_normalize.xlsx --output result.xlsx --fuzzy --threshold 0.85" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
