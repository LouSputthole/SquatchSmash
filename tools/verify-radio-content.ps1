#!/usr/bin/env pwsh
<#
.SYNOPSIS
Transcribes every delivered radio/news voice take with ElevenLabs Scribe v2.

.DESCRIPTION
This is development tooling only. It never writes the API key and never edits
an audio file. The evidence file is resumable and hash-bound, so a transient
request failure or an updated take does not require paying to retranscribe
unchanged recordings.

  $env:ELEVENLABS_API_KEY = '...'
  ./tools/verify-radio-content.ps1 -Node node
  ./tools/verify-radio-content.ps1 -Node node -Check
#>

[CmdletBinding()]
param(
  [switch]$Check,
  [string]$Node = 'node',
  [string]$Output = '',
  [int]$Limit = 0
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $Output) {
  $Output = Join-Path $repoRoot 'docs\audits\radio\content-transcriptions.json'
} elseif (-not [IO.Path]::IsPathRooted($Output)) {
  $Output = Join-Path $repoRoot $Output
}

$schema = 'squatchsmash.radio-content-transcriptions.v1'
$model = 'scribe_v2'
$sourceScript = @'
import fs from 'node:fs/promises';
import { voiceCues } from './src/core/stations.js';
const manifest = JSON.parse(await fs.readFile('./assets/sfx/manifest.json', 'utf8'));
const authored = new Map(voiceCues().map((cue) => [cue.name, cue]));
for (const cue of manifest.sfx) {
  if (typeof cue.say !== 'string' || !cue.say.trim()) continue;
  if (/(^|\.)(radio|news)(\.|$)/i.test(cue.name)) authored.set(cue.name, cue);
}
const merged = [...authored.values()].map((cue) => ({
  name: cue.name,
  file: cue.file || `${cue.name}.mp3`,
  voice: cue.voice || 'player',
  say: cue.say,
})).sort((a, b) => a.name.localeCompare(b.name));
// Base64 keeps curly quotes and other authored punctuation intact when this
// script is launched by legacy Windows PowerShell's native stdout bridge.
process.stdout.write(Buffer.from(JSON.stringify(merged), 'utf8').toString('base64'));
'@

Push-Location $repoRoot
try {
  $sourceJson = & $Node --input-type=module -e $sourceScript
  if ($LASTEXITCODE -ne 0) { throw 'Node could not enumerate radio/news cues.' }
  # Windows PowerShell may surface native stdout as an Object[] and decode it
  # with a legacy code page. Join the ASCII-safe base64 first, then decode the
  # authored UTF-8 text so -Check behaves the same in every supported shell.
  $sourceBase64 = (@($sourceJson) -join '').Trim()
  $sourceText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($sourceBase64))
  $parsedCues = ConvertFrom-Json -InputObject $sourceText
  $cueList = [Collections.Generic.List[object]]::new()
  foreach ($parsedCue in $parsedCues) { $cueList.Add($parsedCue) }
  $cues = @($cueList)
} finally {
  Pop-Location
}

if ($Limit -gt 0) { $cues = @($cues | Select-Object -First $Limit) }

function Get-TextHash([string]$text) {
  $normal = $text.ToLowerInvariant()
  $normal = [regex]::Replace($normal, '[\u2018\u2019\u02BC]', "'")
  $normal = [regex]::Replace($normal, '[\u201C\u201D]', '"')
  $normal = [regex]::Replace($normal, '[\u2013\u2014]', '-')
  $normal = [regex]::Replace($normal, '\s+', ' ').Trim()
  $bytes = [Text.Encoding]::UTF8.GetBytes($normal)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { $hash = $algorithm.ComputeHash($bytes) } finally { $algorithm.Dispose() }
  return (([BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()).Substring(0, 12)
}

function Normalize-Transcript([string]$text) {
  $value = $text.ToLowerInvariant()
  $value = [regex]::Replace($value, '[\u2018\u2019\u02BC]', ([char]39).ToString())
  $value = $value.Replace('&', ' and ')
  $value = [regex]::Replace($value, "[^a-z0-9']+", ' ')
  $value = [regex]::Replace($value, "\bi've\b", 'i have')
  $value = [regex]::Replace($value, '\bgratton\b', 'gratin')
  $value = [regex]::Replace($value, '\bk s q c h\b', 'ksqch')
  $value = [regex]::Replace($value, '\bninety seven point eight\b', '97 8')
  $value = [regex]::Replace($value, '\bone oh one point seven\b', '101 7')
  $value = [regex]::Replace($value, '\bninety eight point eight\b', '98 8')
  $value = [regex]::Replace($value, '\bninety four\b', '94')
  $value = [regex]::Replace($value, '\bfour hundred\b', '400')
  $value = [regex]::Replace($value, '\btwelve\b', '12')
  $value = [regex]::Replace($value, '\bfourteen\b', '14')
  $value = [regex]::Replace($value, '\ba hundred\b', '100')
  $value = [regex]::Replace($value, '\b5 00\b', '5')
  # Scribe often emits hesitation tokens that were not authored. Ignoring only
  # these standalone fillers prevents them from turning otherwise exact speech
  # into false review rows; substantive inserted words still affect the score.
  $value = [regex]::Replace($value, '\b(?:uh|um)\b', ' ')
  $value = [regex]::Replace($value, '([a-z])\1{2,}', '$1')
  return [regex]::Replace($value, '\s+', ' ').Trim()
}

function Get-Similarity([string]$left, [string]$right) {
  $a = Normalize-Transcript $left
  $b = Normalize-Transcript $right
  if ($a -eq $b) { return 1.0 }
  if (-not $a -or -not $b) { return 0.0 }
  $previous = New-Object int[] ($b.Length + 1)
  for ($column = 0; $column -le $b.Length; $column++) { $previous[$column] = $column }
  for ($row = 1; $row -le $a.Length; $row++) {
    $current = New-Object int[] ($b.Length + 1)
    $current[0] = $row
    for ($column = 1; $column -le $b.Length; $column++) {
      $cost = if ($a[$row - 1] -eq $b[$column - 1]) { 0 } else { 1 }
      $current[$column] = [Math]::Min(
        [Math]::Min($current[$column - 1] + 1, $previous[$column] + 1),
        $previous[$column - 1] + $cost
      )
    }
    $previous = $current
  }
  return [Math]::Round(1 - ($previous[$b.Length] / [Math]::Max($a.Length, $b.Length)), 4)
}

function Get-CurrentRows {
  $rows = @()
  foreach ($cue in $cues) {
    $cueFile = [string]$cue.file
    if (-not $cueFile) { throw "Radio/news cue has no file: $($cue.name)" }
    $file = [IO.Path]::Combine($repoRoot, 'assets', 'sfx', $cueFile)
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing radio/news take: $($cue.name) -> $($cue.file)" }
    $item = Get-Item -LiteralPath $file
    if ($item.Length -le 512) { throw "Truncated radio/news take: $($cue.name)" }
    $rows += [pscustomobject]@{
      cue = $cue.name
      file = $cue.file
      voice = $cue.voice
      intended = $cue.say
      intendedTextHash = Get-TextHash $cue.say
      sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
      bytes = $item.Length
      absoluteFile = $file
    }
  }
  return $rows
}

function Save-Evidence($rows) {
  $directory = Split-Path -Parent $Output
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $body = [ordered]@{
    schema = $schema
    model = $model
    languageHint = 'eng'
    keyStoredInRepository = $false
    receipts = @($rows | Sort-Object cue)
  }
  $json = $body | ConvertTo-Json -Depth 7
  [IO.File]::WriteAllText($Output, $json + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
}

$current = @(Get-CurrentRows)
$existing = @{}
if (Test-Path -LiteralPath $Output) {
  $prior = Get-Content -LiteralPath $Output -Raw | ConvertFrom-Json
  if ($prior.schema -eq $schema -and $prior.model -eq $model) {
    foreach ($row in @($prior.receipts)) { $existing[$row.cue] = $row }
  }
}

if ($Check) {
  if (-not (Test-Path -LiteralPath $Output)) { throw "Radio content evidence is missing: $Output" }
  if ($existing.Count -ne $current.Count) {
    throw "Radio content coverage drift: evidence=$($existing.Count) current=$($current.Count)"
  }
  foreach ($row in $current) {
    $receipt = $existing[$row.cue]
    if (-not $receipt) { throw "Missing radio content receipt: $($row.cue)" }
    foreach ($field in @('file', 'voice', 'intendedTextHash', 'sha256', 'bytes')) {
      if ([string]$receipt.$field -ne [string]$row.$field) { throw "Radio content $field drift: $($row.cue)" }
    }
    if (-not $receipt.transcript -or $receipt.language -ne 'eng' -or $receipt.similarity -lt 0.5) {
      throw "Invalid radio content receipt: $($row.cue)"
    }
    $expectedSimilarity = Get-Similarity $row.intended $receipt.transcript
    $expectedStatus = if ($expectedSimilarity -ge 0.86) { 'MATCH' } else { 'REVIEW' }
    if ([Math]::Abs(([double]$receipt.similarity) - $expectedSimilarity) -gt 0.0001 -or $receipt.status -ne $expectedStatus) {
      throw "Radio content classification drift: $($row.cue); rerun the evidence generator."
    }
  }
  $review = @($existing.Values | Where-Object { $_.status -ne 'MATCH' })
  Write-Output "[radio-content] $($current.Count)/$($current.Count) hash-bound Scribe receipts current; $($review.Count) flagged for human review."
  exit 0
}

if (-not $env:ELEVENLABS_API_KEY) {
  throw 'ELEVENLABS_API_KEY is required to create radio content evidence. It is never written to the repository.'
}

$headers = @{ 'xi-api-key' = $env:ELEVENLABS_API_KEY }
$receipts = [Collections.Generic.List[object]]::new()
foreach ($row in $current) {
  $prior = $existing[$row.cue]
  if ($prior -and $prior.sha256 -eq $row.sha256 -and $prior.intendedTextHash -eq $row.intendedTextHash) {
    $prior.similarity = Get-Similarity $row.intended $prior.transcript
    $prior.status = if ($prior.similarity -ge 0.86) { 'MATCH' } else { 'REVIEW' }
    $receipts.Add($prior)
  }
}
$done = @{}
foreach ($row in $receipts) { $done[$row.cue] = $true }
$pending = @($current | Where-Object { -not $done.ContainsKey($_.cue) })
Write-Output "[radio-content] $($current.Count) cues; $($receipts.Count) reusable receipts; $($pending.Count) Scribe requests pending."

$completed = 0
foreach ($row in $pending) {
  $response = $null
  for ($attempt = 0; $attempt -lt 5; $attempt++) {
    try {
      $form = @{
        file = Get-Item -LiteralPath $row.absoluteFile
        model_id = $model
        language_code = 'eng'
      }
      $response = Invoke-WebRequest -Uri 'https://api.elevenlabs.io/v1/speech-to-text' -Method Post -Headers $headers -Form $form
      break
    } catch {
      if ($attempt -eq 4) { throw }
      Start-Sleep -Milliseconds (500 * [Math]::Pow(2, $attempt))
    }
  }
  $body = $response.Content | ConvertFrom-Json
  $similarity = Get-Similarity $row.intended $body.text
  $receipts.Add([pscustomobject]@{
    cue = $row.cue
    file = $row.file
    voice = $row.voice
    intended = $row.intended
    intendedTextHash = $row.intendedTextHash
    sha256 = $row.sha256
    bytes = $row.bytes
    transcript = $body.text
    language = $body.language_code
    languageProbability = $body.language_probability
    similarity = $similarity
    status = if ($similarity -ge 0.86) { 'MATCH' } else { 'REVIEW' }
  })
  $completed++
  if (($completed % 10) -eq 0 -or $completed -eq $pending.Count) {
    Save-Evidence $receipts
    Write-Output "[radio-content] transcribed $completed/$($pending.Count); saved $($receipts.Count)/$($current.Count) receipts."
  }
}

Save-Evidence $receipts
$review = @($receipts | Where-Object { $_.status -ne 'MATCH' })
Write-Output "[radio-content] complete: $($receipts.Count)/$($current.Count) receipts; $($review.Count) flagged for human review."
