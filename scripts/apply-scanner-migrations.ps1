# Applies the three Run 2 scanner migrations to the unified project via the
# Supabase Management API. Used instead of `supabase db push` because the
# remote schema was bootstrapped manually and has no migration history —
# db push would replay every historical migration.
# The access token comes from the CLI's store (file or Windows Credential
# Manager) and is never echoed.
$ErrorActionPreference = 'Stop'
$ref = 'ehtwywctledgkxexztbh'

function Get-SupabaseToken {
  $fileCandidates = @(
    (Join-Path $env:APPDATA 'supabase\access-token'),
    (Join-Path $env:USERPROFILE '.supabase\access-token')
  )
  foreach ($p in $fileCandidates) {
    if (Test-Path $p) { return (Get-Content $p -Raw).Trim() }
  }
  # CLI >= 1.x stores the token in Windows Credential Manager (go-keyring):
  # generic credential, target "Supabase CLI:access-token".
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WinCred {
  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, int type, int flags, out IntPtr credentialPtr);
  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr cred);
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags; public int Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
    public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  public static string Read(string target) {
    IntPtr ptr;
    if (!CredRead(target, 1, 0, out ptr)) return null;
    try {
      var cred = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
      var bytes = new byte[cred.CredentialBlobSize];
      Marshal.Copy(cred.CredentialBlob, bytes, 0, cred.CredentialBlobSize);
      return System.Text.Encoding.UTF8.GetString(bytes);
    } finally { CredFree(ptr); }
  }
}
'@
  foreach ($target in @('Supabase CLI:supabase', 'Supabase CLI:access-token', 'supabase:access-token', 'Supabase CLI', 'supabase')) {
    $t = [WinCred]::Read($target)
    if ($t) { return $t.Trim() }
  }
  return $null
}

$token = Get-SupabaseToken
if (-not $token) { Write-Host 'TOKEN NOT FOUND'; exit 1 }

$files = @(
  'supabase\migrations\20260714100000_app_role_staff.sql',
  'supabase\migrations\20260714100100_handoff_hardening.sql',
  'supabase\migrations\20260714100200_submit_enquiry_rpc.sql',
  'supabase\migrations\20260714100300_jobs_status_enquiry.sql'
)

Add-Type -AssemblyName System.Web.Extensions
$serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$serializer.MaxJsonLength = 33554432

foreach ($f in $files) {
  $sql = [System.IO.File]::ReadAllText((Resolve-Path $f), [System.Text.Encoding]::UTF8)
  $body = $serializer.Serialize(@{ query = $sql })
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  try {
    $null = Invoke-RestMethod -Method Post `
      -Uri "https://api.supabase.com/v1/projects/$ref/database/query" `
      -Headers @{ Authorization = "Bearer $token" } `
      -ContentType 'application/json; charset=utf-8' -Body $bytes
    Write-Host "APPLIED  $f"
  } catch {
    $detail = $_.ErrorDetails.Message
    if (-not $detail) { $detail = $_.Exception.Message }
    Write-Host "FAILED   $f -> $detail"
    exit 1
  }
}
Write-Host 'ALL MIGRATIONS APPLIED'
