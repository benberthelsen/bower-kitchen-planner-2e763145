#Requires -Version 5.1
<#
  ship-verify.ps1 — Bower planner, 20-Jul engine + wizard + share-links drop.

  Runs the authoritative LOCAL checks, then regenerates the AI edge function's
  shared engine copy. Stops before commit/deploy — those stay your conscious
  steps (printed at the end). The two Supabase migrations are ALREADY applied
  (done 20 Jul), so this script does not touch the database.

  Run:  powershell -ExecutionPolicy Bypass -File .\ship-verify.ps1
#>

$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\bench\Claude\Projects\kitchen online planner\bower-kitchen-planner'
Set-Location -LiteralPath $repo
Write-Host "Repo: $repo`n" -ForegroundColor DarkGray

function Step {
  param([string]$Name, [scriptblock]$Cmd)
  Write-Host "=== $Name ===" -ForegroundColor Cyan
  & $Cmd
  if ($LASTEXITCODE -ne 0) {
    Write-Host "`nFAILED: $Name (exit $LASTEXITCODE)." -ForegroundColor Red
    Write-Host "Fix this before committing. Nothing was synced or deployed." -ForegroundColor Red
    exit 1
  }
  Write-Host "PASS: $Name`n" -ForegroundColor Green
}

# 1. Authoritative typecheck. tsconfig.json uses project references + files:[],
#    so a bare `tsc --noEmit` is a NO-OP (typechecks nothing). Target the app
#    project directly — it includes all of src/, where every change lives.
Step 'Typecheck (tsc -p tsconfig.app.json --noEmit)' { npx tsc -p tsconfig.app.json --noEmit }

# 2. Placement sweep — now also enforces the new faces-wall / doorway-tight /
#    island-exposed rules, so a regression of any 20-Jul fix fails here.
Step 'Placement sweep (npm run ai:sweep)' { npm run ai:sweep }

# 3. Targeted suites for the files that changed this drop.
Step 'Layout engine suite (npm run test:layout)'          { npm run test:layout }
Step 'Candidate generator suite (npm run test:candidates)' { npm run test:candidates }

# 4. All green — regenerate the edge function's shared engine copy (layout +
#    room-scan contract). MUST run on the host, per the handover, so the AI
#    function ships the SAME engine the client preview uses.
Step 'Sync AI shared engine (npm run ai:sync-shared)' { npm run ai:sync-shared }

Write-Host '=== Working tree after sync (incl. regenerated _shared files) ===' -ForegroundColor Cyan
git status --short
Write-Host ''
git diff --stat
Write-Host ''

Write-Host 'ALL LOCAL CHECKS PASSED — migrations already live.' -ForegroundColor Green
Write-Host ''
Write-Host 'Do these next, in order:' -ForegroundColor Yellow
Write-Host ''
Write-Host '  A. npm run dev  — click the wizard through once:'
Write-Host '       Room:   pick walls (exclude a side wall, watch U-shape grey out)'
Write-Host '       Design: generate; in 3D check ONE corner (doors clear the return),'
Write-Host '               island has finished ends, fillers sit at the doorway'
Write-Host '       Review: Share design -> open the copied link in an incognito window,'
Write-Host '               confirm the SAME kitchen loads'
Write-Host ''
Write-Host '  B. Commit + push (Cloudflare Pages auto-deploys the front end):'
Write-Host '       git add -A'
Write-Host '       git commit -m "AI planner placement fixes; wizard style-first + wall picker + rich share links"'
Write-Host '       git push'
Write-Host ''
Write-Host '  C. Redeploy the 3 edge functions  ->  .\deploy-planner-functions.ps1'
Write-Host ''
Write-Host 'Reminder: set a hard monthly OpenAI spend cap in the OpenAI dashboard.' -ForegroundColor DarkYellow
