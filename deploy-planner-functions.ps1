#Requires -Version 5.1
<#
  deploy-planner-functions.ps1 — redeploy the 3 planner edge functions that
  carry the 20-Jul code, with the flags the pre-live audit specifies:
    --use-api       avoids the local Docker requirement
    --no-verify-jwt keeps the public homeowner wizard able to call them
  (config.toml already sets verify_jwt=false for these; the flag guarantees it.)

  Run AFTER ship-verify.ps1 passes and you have committed + pushed.
  Run:  powershell -ExecutionPolicy Bypass -File .\deploy-planner-functions.ps1
#>

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath 'C:\Users\bench\Claude\Projects\kitchen online planner\bower-kitchen-planner'

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  Write-Host 'Supabase CLI not found - installing via npm...' -ForegroundColor Yellow
  npm install -g supabase
  if ($LASTEXITCODE -ne 0) { Write-Host 'CLI install failed.' -ForegroundColor Red; exit 1 }
}

Write-Host 'Linking to bower-cabinet-ai (ehtwywctledgkxexztbh)...' -ForegroundColor Cyan
supabase link --project-ref ehtwywctledgkxexztbh
if ($LASTEXITCODE -ne 0) { Write-Host 'Link failed.' -ForegroundColor Red; exit 1 }

$functions = @('ai-designer', 'submit-planner-enquiry', 'send-email')
foreach ($fn in $functions) {
  Write-Host "Deploying $fn..." -ForegroundColor Cyan
  supabase functions deploy $fn --use-api --no-verify-jwt
  if ($LASTEXITCODE -ne 0) { Write-Host "Deploy FAILED: $fn (exit $LASTEXITCODE)." -ForegroundColor Red; exit 1 }
  Write-Host "Deployed $fn.`n" -ForegroundColor Green
}

Write-Host 'All 3 planner functions deployed.' -ForegroundColor Green
Write-Host 'Smoke test: open planner.bowercabinets.com/wizard, generate an AI design,'
Write-Host 'submit an enquiry, and confirm it lands in Admin -> Leads.'
