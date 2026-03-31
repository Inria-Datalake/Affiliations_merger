# ============================================================
# Script de migration Base44 → Sans Base44
# À lancer depuis la racine du projet affiliations_merger
# ============================================================

$projectRoot = $PSScriptRoot
$outputsRoot = Join-Path $projectRoot "outputs"

Write-Host ""
Write-Host "=== Migration Base44 ===" -ForegroundColor Cyan
Write-Host "Projet : $projectRoot"
Write-Host "Sources : $outputsRoot"
Write-Host ""

# Vérifie que le dossier outputs existe
if (-not (Test-Path $outputsRoot)) {
    Write-Host "ERREUR : Le dossier 'outputs' est introuvable." -ForegroundColor Red
    Write-Host "Placez ce script à la racine du projet, avec le dossier 'outputs' au même niveau." -ForegroundColor Yellow
    exit 1
}

# Liste des copies à effectuer : @(source_relative, destination_relative)
$filesToCopy = @(
    @("vite.config.js",                                   "vite.config.js"),
    @("src\api\llmClient.js",                             "src\api\llmClient.js"),
    @("src\pages\AffiliationMerger.jsx",                  "src\pages\AffiliationMerger.jsx"),
    @("src\App.jsx",                                      "src\App.jsx"),
    @("src\components\merger\FileUpload.jsx",             "src\components\merger\FileUpload.jsx")
)

# Copie les fichiers
foreach ($pair in $filesToCopy) {
    $src  = Join-Path $outputsRoot $pair[0]
    $dest = Join-Path $projectRoot $pair[1]

    if (-not (Test-Path $src)) {
        Write-Host "  MANQUANT  $($pair[0])" -ForegroundColor Yellow
        continue
    }

    # Crée le dossier destination si besoin
    $destDir = Split-Path $dest -Parent
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    Copy-Item -Path $src -Destination $dest -Force
    Write-Host "  OK  $($pair[1])" -ForegroundColor Green
}

Write-Host ""

# Supprime base44Client.js s'il existe encore
$toDelete = Join-Path $projectRoot "src\api\base44Client.js"
if (Test-Path $toDelete) {
    Remove-Item $toDelete -Force
    Write-Host "  SUPPRIME  src\api\base44Client.js" -ForegroundColor Magenta
} else {
    Write-Host "  (base44Client.js déjà absent, rien à supprimer)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "=== Migration terminée ! ===" -ForegroundColor Cyan
Write-Host "Lance maintenant : npm run dev" -ForegroundColor White
Write-Host ""