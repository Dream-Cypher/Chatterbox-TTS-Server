# Acceptance matrix. Start the server with the right model.repo_id in config.yaml
# BEFORE running each group - the server reads it at startup.
#   .\tests\run_matrix.ps1 -Group turbo
#
# Clone reference note: the brief's original clone reference (tifa_original.wav)
# does not exist in this checkout. reference_audio/ has exactly Gianna.wav (9.7s)
# and Robert.wav (6.9s). Gianna.wav is used for every clone row instead.
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('turbo','nano','multilingual','original')]
    [string]$Group,
    [string]$Base = 'http://127.0.0.1:8004',
    [int]$Seed = 424242
)

$out  = Join-Path $PSScriptRoot 'out'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$manifest = Join-Path $out 'manifest.csv'
if (-not (Test-Path $manifest)) {
    'row,group,voice_mode,voice,text,seed,bytes,seconds' | Set-Content $manifest
}

function Text($n) { Get-Content (Join-Path $PSScriptRoot "texts\$n.txt") -Raw }

# Objects, not nested arrays - a PowerShell switch unrolls arrays into the
# pipeline, which would flatten @(@(1,..),@(2,..)) into one long list.
function Row($id, $mode, $voice, $textId, $extra) {
    [pscustomobject]@{ Id=$id; Mode=$mode; Voice=$voice; TextId=$textId; Extra=$extra }
}

$rows = switch ($Group) {
    'turbo'        { Row 1 'predefined' 'Elena.wav' 'T2' ''
                     Row 7 'clone' 'Gianna.wav' 'T1' ''
                     Row 9 'predefined' 'Elena.wav' 'T1' '' }
    'nano'         { Row 2 'predefined' 'Elena.wav' 'T2' ''
                     Row 3 'predefined' 'Elena.wav' 'T1' '' }
    'multilingual' { Row 4 'predefined' 'Elena.wav' 'T1' ''
                     Row 5 'clone' 'Gianna.wav' 'T1' '' }
    'original'     { Row 6 'predefined' 'Elena.wav' 'T1' '"exaggeration":1.8,'
                     Row 8 'predefined' 'Elena.wav' 'T3' ''
                     Row 90 'predefined' 'Elena.wav' 'T1' '' }
}

foreach ($r in $rows) {
    $id = $r.Id; $mode = $r.Mode; $voice = $r.Voice; $textId = $r.TextId; $extra = $r.Extra
    $voiceField = if ($mode -eq 'clone') { 'reference_audio_filename' } else { 'predefined_voice_id' }
    $body = '{"text":' + ((Text $textId) | ConvertTo-Json) + ',"voice_mode":"' + $mode + '","' +
            $voiceField + '":"' + $voice + '",' + $extra + '"seed":' + $Seed +
            ',"output_format":"wav","split_text":true,"chunk_size":240}'
    $file = Join-Path $out ("row{0}_{1}_{2}.wav" -f $id, $Group, $textId)

    Write-Host "row $id : $Group / $mode / $voice / $textId ..." -NoNewline
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        Invoke-RestMethod -Uri "$Base/tts" -Method Post -ContentType 'application/json' -Body $body -OutFile $file -ErrorAction Stop
        $sw.Stop()
        $bytes = (Get-Item $file).Length
        if ($bytes -lt 10000) { Write-Host " SUSPICIOUS ($bytes bytes)" -ForegroundColor Yellow }
        else { Write-Host (" ok  {0:N0} bytes  {1:N1}s" -f $bytes, $sw.Elapsed.TotalSeconds) -ForegroundColor Green }
        "$id,$Group,$mode,$voice,$textId,$Seed,$bytes,$([math]::Round($sw.Elapsed.TotalSeconds,1))" |
            Add-Content $manifest
    } catch {
        $sw.Stop()
        Write-Host " FAILED: $($_.Exception.Message)" -ForegroundColor Red
        "$id,$Group,$mode,$voice,$textId,$Seed,ERROR,0" | Add-Content $manifest
    }
}
Write-Host "`nManifest: $manifest"
