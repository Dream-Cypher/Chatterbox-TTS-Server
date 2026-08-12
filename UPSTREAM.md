# Keeping this fork current

Run `pwsh tests/check_upstreams.ps1` to see whether either upstream has moved.

There are two, and they update differently.

**All commands below are PowerShell (`pwsh`)** - this machine's primary shell (see
`E:\tts\CLAUDE.md`). Line continuation is the backtick `` ` ``, not backslash, and environment
variables are set with `$env:NAME = 'value'`, not a `NAME=value` prefix - both differ from bash.
Where a step depends on an environment variable set in an earlier step, run the block as shown,
in order, in the same `pwsh` session.

## 1. resemble-ai/chatterbox - the package (the important one)

Every model release lands here. v3 multilingual arrived 2026-05-01 and
2026-06-10; Nano 2026-07-21. **Do not watch PyPI** - the latest release there
is 0.1.7 from 2026-03-26, months behind master. Watch commits on `master`.

Updating is a pin bump, not a rebase:

```powershell
# 1. read what changed
gh api "repos/resemble-ai/chatterbox/commits?sha=master&per_page=20" `
  --jq '.[] | "\(.commit.author.date[0:10])  \(.sha[0:8])  \(.commit.message | split("\n")[0])"'

# 2. change the SHA in start.py:112 and in tests/check_upstreams.ps1 ($PKG_PINNED)

# 3. reinstall the package only
python_embedded/python.exe -m pip install --no-deps --force-reinstall `
  git+https://github.com/resemble-ai/chatterbox.git@<new-sha>

# 4. REQUIRED - reapply the two runtime patches
# start.py's watermarker/MPS patches only run on start.py's *fresh-install*
# code path (perform_installation(), gated behind "no existing installation
# detected"). A direct pip reinstall - step 3 above, or `pip install
# --force-reinstall` in general - never goes through that branch, so the
# patches are silently skipped. Skipping them is not cosmetic: the server
# crashes on model load with
#     perth.PerthImplicitWatermarker() -> "NoneType object is not callable"
# This bit Task 3 of the original upgrade (see task-3-report.md) the first
# time the package was reinstalled this way. Reapply both patches directly
# - they are idempotent, so running them against an already-patched
# install is a safe no-op (verified both ways - see task-9-report.md):
$env:PYTHONIOENCODING = 'utf-8'
python_embedded/python.exe -c @'
import sys; sys.path.insert(0, ".")
import start
from pathlib import Path
env_dir = Path("python_embedded")
start._patch_chatterbox_watermarker(env_dir, True)
start._patch_chatterbox_mps_float32(env_dir, True)
'@

# 5. re-verify
python_embedded/python.exe tests/test_selector.py
python_embedded/python.exe tests/test_tags.py
pwsh tests/run_matrix.ps1 -Group turbo
```

`$env:PYTHONIOENCODING = 'utf-8'` is **not optional** - it works around a console-encoding crash in
`start.py`'s `print_substep` (Unicode check-mark/warning icons). Without it, step 4 dies partway
through with `UnicodeEncodeError: 'charmap' codec can't encode character '→'` on a normal
Windows console (cp1252) - confirmed by running it both ways, see task-9-report.md. It doesn't
change what gets written to disk, only whether the progress output can print - but the exception
kills the process before every patched file is even attempted, so the guard matters. Once set in a
`pwsh` session, it stays set for the rest of that session, including step 5.

**Watch for:** a new model class (would need a new selector in
`MODEL_SELECTOR_MAP`, engine.py:57), a changed `from_pretrained` signature
(would break `_load_kwargs_for`, engine.py:200), and a raised `transformers`
floor - the pin here stays deliberately behind, see the plan's Task 3.

## 2. devnen/Chatterbox-TTS-Server - the server this fork is based on

Static since 2026-05-26. Forked at `915ae28`.

    git fetch upstream
    git log --oneline v3-nano..upstream/main     # read before rebasing
    git rebase upstream/main

Resolve conflicts keeping **their structure** and **your values** - take their
refactoring, re-apply your `CHATTERBOX_REPO` on top.

If devnen adopts Nano or v3 themselves, drop your commit rather than merging it:

    git rebase --onto upstream/main <your-commit> v3-nano

### Where conflicts will happen

| file | your change | risk |
|---|---|---|
| `start.py:112` | `CHATTERBOX_REPO` repointed and pinned | high - single line, they edit it too |
| `engine.py` | Nano selectors, `_load_kwargs_for`, 19-tag list | medium |
| `requirements*.txt` | package URL, `pykakasi` | medium |
| `config.yaml` | `model.t3_model` plus local settings | low, but holds local state |

## After any update to either

    python_embedded/python.exe tests/test_selector.py
    python_embedded/python.exe tests/test_tags.py

`test_tags.py` compares the advertised tag list against the live checkpoint, so
it also catches Resemble *adding* tags in a future release.

If the package was reinstalled (section 1), also confirm the server actually
loads a model before trusting the tests above - the watermarker crash in
step 4 happens at model load, which none of the current test scripts exercise.
A quick way: start the server and poll `/api/model-info` for `"loaded":true`.
