$ErrorActionPreference = "Stop"

$projectRoot = Get-Location
$target = Join-Path $projectRoot "components\GestionaleAppChrome.tsx"

if (-not (Test-Path $target)) {
  Write-Host ""
  Write-Host "ERRORE: non trovo components\GestionaleAppChrome.tsx" -ForegroundColor Red
  Write-Host "Esegui questo file dalla cartella C:\Users\utente\magazzino-web" -ForegroundColor Yellow
  exit 1
}

$text = Get-Content -Path $target -Raw -Encoding UTF8

if ($text -match 'label:\s*"Produzione"' -and $text -match 'href:\s*"/produzione"') {
  Write-Host ""
  Write-Host "Il menu Produzione e gia presente. Nessuna modifica necessaria." -ForegroundColor Green
  exit 0
}

$backup = "$target.backup-produzione"
Copy-Item -Path $target -Destination $backup -Force

$pattern = '(?ms)(\s*\{\s*label:\s*"Magazzino",\s*href:\s*"/suppliers",)'
$productionItem = @'
  {
    label: "Produzione",
    href: "/produzione",
    icon: "movements",
    activePrefixes: ["/produzione"],
  },

'@

if ($text -match $pattern) {
  $text = [regex]::Replace(
    $text,
    $pattern,
    ($productionItem + '$1'),
    1
  )
}
else {
  Write-Host ""
  Write-Host "ERRORE: non ho trovato il punto corretto del menu Magazzino." -ForegroundColor Red
  Write-Host "Il file originale non e stato modificato." -ForegroundColor Yellow
  Copy-Item -Path $backup -Destination $target -Force
  exit 1
}

if ($text -notmatch 'label="Produzione"') {
  $mobilePattern = '(?ms)(\s*<MobileNavButton\s+active=\{\s*pathname\.startsWith\(\s*"/suppliers"\s*\)\s*\}\s*label="Magazzino")'
  $mobileItem = @'

        <MobileNavButton
          active={
            pathname.startsWith(
              "/produzione"
            )
          }
          label="Produzione"
          icon="movements"
          onClick={() =>
            router.push(
              "/produzione"
            )
          }
        />

'@

  if ($text -match $mobilePattern) {
    $text = [regex]::Replace(
      $text,
      $mobilePattern,
      ($mobileItem + '$1'),
      1
    )
  }
}

Set-Content -Path $target -Value $text -Encoding UTF8

$check = Get-Content -Path $target -Raw -Encoding UTF8

if ($check -notmatch 'label:\s*"Produzione"' -or $check -notmatch 'href:\s*"/produzione"') {
  Copy-Item -Path $backup -Destination $target -Force
  Write-Host ""
  Write-Host "ERRORE durante la modifica. Ripristinato automaticamente il file originale." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "OK - Menu PRODUZIONE aggiunto al Gestionale/PWA." -ForegroundColor Green
Write-Host "Backup automatico: components\GestionaleAppChrome.tsx.backup-produzione" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Ora esegui: npm run build" -ForegroundColor Cyan
