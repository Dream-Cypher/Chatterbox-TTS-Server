"""Assert the advertised tag list matches the Turbo checkpoint's added_tokens.json.

Run: python_embedded\python.exe tests\test_tags.py
"""
import sys, json, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import engine
from huggingface_hub import hf_hub_download

path = hf_hub_download("ResembleAI/chatterbox-turbo", "added_tokens.json")
tokens = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
from_checkpoint = sorted(t.strip("[]") for t in tokens)
advertised = sorted(engine.TURBO_PARALINGUISTIC_TAGS)

missing = [t for t in from_checkpoint if t not in advertised]
extra = [t for t in advertised if t not in from_checkpoint]

if missing or extra:
    print(f"FAIL  missing from advertised list: {missing}")
    print(f"      advertised but not in checkpoint: {extra}")
    sys.exit(1)

print(f"ok    {len(advertised)} tags match the checkpoint")
