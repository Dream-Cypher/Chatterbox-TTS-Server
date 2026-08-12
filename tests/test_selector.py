"""Standalone checks for model-selector plumbing. No pytest required.

Run: python_embedded\python.exe tests\test_selector.py
Exits non-zero on first failure.
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import engine

def check(label, got, want):
    if got != want:
        print(f"FAIL {label}: got {got!r}, want {want!r}")
        sys.exit(1)
    print(f"ok   {label}")

check("nano selector maps",  engine.MODEL_SELECTOR_MAP.get("chatterbox-nano"), "nano")
check("bare nano maps",      engine.MODEL_SELECTOR_MAP.get("nano"), "nano")
check("turbo still maps",    engine.MODEL_SELECTOR_MAP.get("chatterbox-turbo"), "turbo")
check("original still maps", engine.MODEL_SELECTOR_MAP.get("chatterbox"), "original")

check("nano kwargs",        engine._load_kwargs_for("nano"), {"nano": True})
check("turbo kwargs empty", engine._load_kwargs_for("turbo"), {})
check("original kwargs empty", engine._load_kwargs_for("original"), {})

cls, mtype = engine._get_model_class("chatterbox-nano")
check("nano resolves to turbo class", cls.__name__, "ChatterboxTurboTTS")
check("nano type string", mtype, "nano")

print("\nAll selector checks passed.")
