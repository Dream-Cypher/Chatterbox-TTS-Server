# Reports how far behind each upstream this fork has drifted, and checks that
# a rebase (or any other edit) has not reintroduced a torch pin below the
# CVE-2025-32434 security floor (torch >= 2.6.0 - see UPSTREAM.md).
# Needs gh authenticated. Run it whenever you wonder if there is anything new.
#
#   pwsh tests/check_upstreams.ps1

$PKG_PINNED = '5de7a54aa4e5e2baadb0182dde554908b48b85c2'  # keep in sync with start.py:115
$SRV_BASE   = '915ae289340e10c6047f27f47e22eae9bf350c32'  # devnen main at fork time

function Test-TorchFloor {
    # CVE-2025-32434 (RCE via torch.load, even with weights_only=True) is fixed in
    # torch 2.6.0. This scans every git-tracked file (so it also covers the notebook,
    # READMEs, and documentation.md - not just requirements*.txt) for a torch pin
    # below that floor and fails loudly if it finds one.
    Write-Host "`nTorch security floor (CVE-2025-32434, torch >= 2.6.0)" -ForegroundColor Cyan

    $pattern = 'torch==2\.[0-5]\.'
    $trackedFiles = git ls-files
    $offenders = New-Object System.Collections.Generic.List[object]

    foreach ($f in $trackedFiles) {
        if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { continue }
        try {
            $found = Select-String -LiteralPath $f -Pattern $pattern -ErrorAction Stop
        } catch {
            continue  # binary or unreadable file - not a text pin, skip
        }
        foreach ($m in $found) {
            $offenders.Add([PSCustomObject]@{ File = $f; Line = $m.LineNumber; Text = $m.Line.Trim() })
        }
    }

    if ($offenders.Count -eq 0) {
        Write-Host "  OK - no torch==2.0-2.5 pin found in any tracked file" -ForegroundColor Green
        return $true
    }

    Write-Host "  FAIL - torch pin(s) below the CVE-2025-32434 floor found:" -ForegroundColor Red
    foreach ($o in $offenders) {
        Write-Host ("    {0}:{1}: {2}" -f $o.File, $o.Line, $o.Text) -ForegroundColor Red
    }
    return $false
}

$torchFloorOk = Test-TorchFloor

function Report {
    param(
        [string]$Label,
        [string]$Repo,
        [string]$Branch,
        [string]$Since
    )

    Write-Host "`n$Label ($Repo)" -ForegroundColor Cyan

    $head = gh api "repos/$Repo/commits/$Branch" --jq '.sha'

    if ($head -eq $Since) {
        Write-Host "  up to date at $($head.Substring(0,8))" -ForegroundColor Green
        return
    }

    # Pull the commit list as objects and slice it in PowerShell rather than
    # building the "since" cutoff into the jq filter string - avoids escaping
    # the pinned SHA into a jq/backtick expression.
    $commits = gh api "repos/$Repo/commits?sha=$Branch&per_page=100" | ConvertFrom-Json

    $new = New-Object System.Collections.Generic.List[object]
    $foundPin = $false
    foreach ($c in $commits) {
        if ($c.sha -eq $Since) { $foundPin = $true; break }
        $new.Add($c)
    }

    Write-Host "  BEHIND. New commits since $($Since.Substring(0,8)):" -ForegroundColor Yellow
    $new | Select-Object -First 15 | ForEach-Object {
        # gh api | ConvertFrom-Json auto-parses ISO8601 date strings into
        # [DateTime] objects (PowerShell 7+ behavior) - Get-Date normalizes
        # either that or a plain string the same way.
        $date = (Get-Date $_.commit.author.date).ToString('yyyy-MM-dd')
        $sha  = $_.sha.Substring(0, 8)
        $msg  = ($_.commit.message -split "`n")[0]
        Write-Host "    $date  $sha  $msg"
    }
    if ($new.Count -gt 15) {
        Write-Host "    ... and $($new.Count - 15) more" -ForegroundColor Yellow
    }
    if (-not $foundPin) {
        Write-Host "  (pinned SHA not found in the last 100 commits on $Branch - it's badly behind; check manually)" -ForegroundColor Red
    }
}

Report -Label 'PACKAGE  (v3/Nano/models land here)' -Repo 'resemble-ai/chatterbox' -Branch 'master' -Since $PKG_PINNED
Report -Label 'SERVER   (this fork is based on it)'  -Repo 'devnen/Chatterbox-TTS-Server' -Branch 'main' -Since $SRV_BASE

Write-Host "`nPackage update  : bump the SHA in start.py:115 and here, reinstall, re-run the tests."
Write-Host "Server update   : git fetch upstream; git rebase upstream/main. See UPSTREAM.md."

if (-not $torchFloorOk) {
    Write-Host "`ncheck_upstreams.ps1: FAILED - a torch pin below the CVE-2025-32434 floor is present. See above." -ForegroundColor Red
    exit 1
}
