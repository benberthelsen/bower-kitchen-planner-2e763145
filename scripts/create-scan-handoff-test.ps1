# QA journey 4: create a tokenized handoff carrying an UNCONFIRMED room scan.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Web.Extensions
$envText = Get-Content '.env' -Raw
$url = [regex]::Match($envText, 'VITE_SUPABASE_URL="?([^"\r\n]+)"?').Groups[1].Value.TrimEnd('/')
$anon = [regex]::Match($envText, 'VITE_SUPABASE_PUBLISHABLE_KEY="?([^"\r\n]+)"?').Groups[1].Value
$fixtures = Get-Content 'src/lib/roomScan/__fixtures__/valid.json' -Raw
$ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$ser.MaxJsonLength = 33554432
$all = $ser.DeserializeObject($fixtures)
$scan = ($all | Where-Object { $_.name -eq 'webxr-unconfirmed-rectangle' }).data
# Unmistakable values so prefill is provable (defaults are 3600/2520).
$scan.room.width = 4212
$scan.room.depth = 2856
$payload = @{
  handoffSchemaVersion = 1
  source = 'scanner'
  roomType = 'kitchen'
  styleTags = @('qa-journey-4')
  materials = @{}
  notes = 'QA-J4 scan handoff — safe to delete'
  roomScan = $scan
}
$body = [System.Text.Encoding]::UTF8.GetBytes($ser.Serialize(@{ payload = $payload; lead = @{ name = 'QA-J4' } }))
$r = Invoke-RestMethod -Method Post -Uri "$url/functions/v1/create-planner-handoff" `
  -Headers @{ Authorization = "Bearer $anon"; apikey = $anon } `
  -ContentType 'application/json' -Body $body
Write-Host "WIZARD_URL=http://localhost:8080/wizard?handoff=$($r.id)#handoffToken=$($r.token)"
