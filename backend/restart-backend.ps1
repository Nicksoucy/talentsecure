# Script pour redemarrer le backend avec Prisma regenere

Write-Host "Arret du serveur backend..." -ForegroundColor Yellow

# Trouver et arreter les processus npm run dev dans le dossier backend
$backendPath = "C:\Recrutement\talentsecure\backend"
Get-Process node -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -and (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine -like "*$backendPath*"
} | ForEach-Object {
    Write-Host "  Arret du processus $($_.Id)..." -ForegroundColor Gray
    Stop-Process -Id $_.Id -Force
}

Write-Host "Attente de 3 secondes..." -ForegroundColor Gray
Start-Sleep -Seconds 3

Write-Host "Regeneration du client Prisma..." -ForegroundColor Cyan
Set-Location $backendPath
npx prisma generate

if ($LASTEXITCODE -eq 0) {
    Write-Host "Client Prisma regenere avec succes!" -ForegroundColor Green
    
    Write-Host "Redemarrage du serveur backend..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; npm run dev"
    
    Write-Host "Backend redemarre!" -ForegroundColor Green
} else {
    Write-Host "Erreur lors de la regeneration de Prisma" -ForegroundColor Red
}
