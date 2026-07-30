#Requires -Version 5.1
<#
  Deploy the homeowner planner Edge Functions with the authentication settings
  used by the application:
    --use-api       avoids the local Docker requirement
    --no-verify-jwt keeps public homeowner entry points callable

  promote-ai-design remains JWT-protected and also checks the staff role in-code.

  Run AFTER the release checks pass and the exact release commit is pushed:
    powershell -ExecutionPolicy Bypass -File .\deploy-planner-functions.ps1
#>

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$ProjectRef = 'ehtwywctledgkxexztbh'

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  Write-Host 'Supabase CLI not found - installing via npm...' -ForegroundColor Yellow
  npm install -g supabase
  if ($LASTEXITCODE -ne 0) { Write-Host 'CLI install failed.' -ForegroundColor Red; exit 1 }
}

$PublicFunctions = @(
  'ai-designer',
  'submit-planner-enquiry',
  'create-planner-handoff',
  'get-planner-handoff'
)

foreach ($FunctionName in $PublicFunctions) {
  Write-Host "Deploying public function $FunctionName..." -ForegroundColor Cyan
  supabase functions deploy $FunctionName --project-ref $ProjectRef --use-api --no-verify-jwt
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Deploy FAILED: $FunctionName (exit $LASTEXITCODE)." -ForegroundColor Red
    exit 1
  }
  Write-Host "Deployed $FunctionName.`n" -ForegroundColor Green
}

foreach ($FunctionName in @('promote-ai-design', 'send-email')) {
  Write-Host "Deploying authenticated function $FunctionName..." -ForegroundColor Cyan
  supabase functions deploy $FunctionName --project-ref $ProjectRef --use-api
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Deploy FAILED: $FunctionName (exit $LASTEXITCODE)." -ForegroundColor Red
    exit 1
  }
}

Write-Host 'All homeowner planner functions deployed.' -ForegroundColor Green
Write-Host 'Smoke test: open planner.bowercabinets.com/wizard, generate an AI design,'
Write-Host 'submit an enquiry, and confirm it lands in Admin -> Leads.'
