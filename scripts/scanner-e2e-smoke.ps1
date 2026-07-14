# Run 2 exit gate: live E2E over the deployed scanner backend.
# Anonymous tokenized handoff journey + RLS deny-by-default checks.
# Uses only the public anon key from .env (safe to embed in browsers).
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$envText = Get-Content '.env' -Raw
$url = [regex]::Match($envText, 'VITE_SUPABASE_URL="?([^"\r\n]+)"?').Groups[1].Value.TrimEnd('/')
$anon = [regex]::Match($envText, 'VITE_SUPABASE_PUBLISHABLE_KEY="?([^"\r\n]+)"?').Groups[1].Value

$headers = @{ Authorization = "Bearer $anon"; apikey = $anon }
$script:pass = 0; $script:fail = 0
function Check($name, $ok) {
  if ($ok) { $script:pass++; Write-Host "PASS  $name" }
  else { $script:fail++; Write-Host "FAIL  $name" }
}
function PostJson($path, $obj, [switch]$Raw) {
  $body = [System.Text.Encoding]::UTF8.GetBytes((New-Object System.Web.Script.Serialization.JavaScriptSerializer).Serialize($obj))
  try {
    return Invoke-RestMethod -Method Post -Uri "$url$path" -Headers $headers -ContentType 'application/json' -Body $body
  } catch {
    $status = 0
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    return @{ __error = $true; status = $status }
  }
}
Add-Type -AssemblyName System.Web.Extensions

# 1. Create a tokenized handoff (strict V1 payload).
$payload = @{
  handoffSchemaVersion = 1; source = 'website'; roomType = 'kitchen'
  dimensions = @{ widthMm = 3600; depthMm = 3000 }
  styleTags = @('run2-e2e'); materials = @{}
  notes = 'RUN2-E2E-TEST — safe to delete'
}
$created = PostJson '/functions/v1/create-planner-handoff' @{ payload = $payload; lead = @{ name = 'RUN2-E2E-TEST' } }
Check 'create-planner-handoff returns id+token' ($created.id -and $created.token)

# 2. Tokenized retrieval.
$got = PostJson '/functions/v1/get-planner-handoff' @{ handoffId = $created.id; token = $created.token }
Check 'get-planner-handoff returns payload' ($got.payload.roomType -eq 'kitchen')
Check 'retrieval did not consume' (-not $got.consumedAt)

# 3. Wrong token → generic 404, no existence leak.
$bad = PostJson '/functions/v1/get-planner-handoff' @{ handoffId = $created.id; token = ('x' * 43) }
Check 'wrong token rejected (404)' ($bad.__error -and $bad.status -eq 404)

# 4. Invalid payload rejected by strict parser.
$badCreate = PostJson '/functions/v1/create-planner-handoff' @{ payload = @{ source = 'website' } }
Check 'strict create rejects legacy/invalid payload (400)' ($badCreate.__error -and $badCreate.status -eq 400)

# 5. Atomic submission with handoff.
$key = [guid]::NewGuid().ToString()
$job = @{
  name = 'RUN2-E2E-TEST – Kitchen Enquiry'
  notes = 'RUN2-E2E-TEST — safe to delete'
  design_data = @{ wizardVersion = 2; roomWidth = 3600 }
  cost_excl_tax = 100; cost_incl_tax = 110
  status = 'enquiry'; delivery_method = 'pickup'
}
$sub = PostJson '/functions/v1/submit-planner-enquiry' @{ submissionKey = $key; handoffId = $created.id; token = $created.token; job = $job }
Check 'submission returns jobId' ([bool]$sub.jobId)
Check 'first submission is not a replay' ($sub.idempotentReplay -eq $false)

# 6. Same key + same payload → idempotent replay, same job.
$sub2 = PostJson '/functions/v1/submit-planner-enquiry' @{ submissionKey = $key; handoffId = $created.id; token = $created.token; job = $job }
Check 'replay returns same job' ($sub2.jobId -eq $sub.jobId)
Check 'replay flagged idempotent' ($sub2.idempotentReplay -eq $true)

# 7. Same key + different payload → rejected.
$jobChanged = $job.Clone(); $jobChanged.cost_incl_tax = 111
$sub3 = PostJson '/functions/v1/submit-planner-enquiry' @{ submissionKey = $key; handoffId = $created.id; token = $created.token; job = $jobChanged }
Check 'key reuse with changed payload rejected (409)' ($sub3.__error -and $sub3.status -eq 409)

# 8. Organic (handoff-less) submission works and is idempotent.
$key2 = [guid]::NewGuid().ToString()
$org = PostJson '/functions/v1/submit-planner-enquiry' @{ submissionKey = $key2; job = $job }
$org2 = PostJson '/functions/v1/submit-planner-enquiry' @{ submissionKey = $key2; job = $job }
Check 'organic submission returns jobId' ([bool]$org.jobId)
Check 'organic replay idempotent' ($org2.jobId -eq $org.jobId -and $org2.idempotentReplay -eq $true)

# 9. Unconfirmed scan rejected at the boundary even if the UI is bypassed.
$tamperJob = $job.Clone()
$tamperJob.design_data = @{ roomScan = @{ state = 'unconfirmed'; schemaVersion = 1 } }
$tamper = PostJson '/functions/v1/submit-planner-enquiry' @{ submissionKey = [guid]::NewGuid().ToString(); job = $tamperJob }
Check 'unconfirmed scan rejected (400)' ($tamper.__error -and $tamper.status -eq 400)

# 10. RLS deny-by-default: anonymous direct reads see nothing; writes fail.
try {
  $rows = Invoke-RestMethod -Uri "$url/rest/v1/planner_handoffs?select=id&limit=5" -Headers $headers
  Check 'anon direct SELECT returns zero rows' ($rows.Count -eq 0)
} catch { Check 'anon direct SELECT returns zero rows' $true }
$ins = PostJson '/rest/v1/planner_handoffs' @{ source = 'website'; payload = @{} }
Check 'anon direct INSERT fails' ($ins.__error -and ($ins.status -eq 401 -or $ins.status -eq 403))

Write-Host ''
Write-Host "scanner e2e: $script:pass passed, $script:fail failed"
if ($script:fail -gt 0) { exit 1 }
