# WS6 — one-shot deploy of all planner edge functions to bower-cabinet-ai.
# Run from this folder in PowerShell:  .\deploy-functions.ps1
# First time only, it will open a browser to log the Supabase CLI in.

$ErrorActionPreference = "Stop"

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  Write-Host "Supabase CLI not found - installing via npm..." -ForegroundColor Yellow
  npm install -g supabase
}

Write-Host "Linking to bower-cabinet-ai (ehtwywctledgkxexztbh)..." -ForegroundColor Cyan
supabase link --project-ref ehtwywctledgkxexztbh

$functions = @(
  "import-microvellum",
  "process-dxf-geometry",
  "export-microvellum-xml",
  "import-prices",
  "import-pricing",
  "import-supplier-materials",
  "scheduled-supplier-import",
  "send-email"
)

foreach ($fn in $functions) {
  Write-Host "Deploying $fn..." -ForegroundColor Cyan
  supabase functions deploy $fn
}

Write-Host "`nAll planner functions deployed." -ForegroundColor Green
Write-Host "Verify: open Admin -> Settings -> Microvellum Product Catalog and run the bundled import."
