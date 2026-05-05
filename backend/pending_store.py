"""pending_store.py - Persistent pending state via JSON file"""
import json
from pathlib import Path

PENDING_FILE = Path(__file__).resolve().parent.parent / "_pending_updates.json"
_pending = {}


def _load():
    global _pending
    if PENDING_FILE.exists():
        try:
            _pending = json.loads(PENDING_FILE.read_text(encoding="utf-8"))
        except Exception:
            _pending = {}


def _save():
    PENDING_FILE.write_text(json.dumps(_pending, indent=2), encoding="utf-8")


def get_pending():
    return _pending


def set_pending(key, value):
    _pending[key] = value
    _save()


def remove_pending(key):
    _pending.pop(key, None)
    _save()


def clear_pending():
    global _pending
    _pending = {}
    if PENDING_FILE.exists():
        PENDING_FILE.unlink()


# Auto-load on import
_load()
