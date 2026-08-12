# Reports how far behind each upstream this fork has drifted.
# Needs gh authenticated. Run it whenever you wonder if there is anything new.
#
#   pwsh tests/check_upstreams.ps1

$PKG_PINNED = '5de7a54aa4e5e2baadb0182dde554908b48b85c2'  # keep in sync with start.py:112
$SRV_BASE   = '915ae289340e10c6047f27f47e22eae9bf350c32'  # devnen main at fork time

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

Write-Host "`nPackage update  : bump the SHA in start.py:112 and here, reinstall, re-run the tests."
Write-Host "Server update   : git fetch upstream; git rebase upstream/main. See UPSTREAM.md."
