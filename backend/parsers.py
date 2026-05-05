"""parsers.py - Extract employee identifier, hours, and leave days from prompts"""
import re
from datetime import datetime


def extract_hours(text):
    """Extract timesheet hours value. Returns float or None."""
    for pat in [r'\bto\s+(\d+(?:\.\d+)?)\b', r'(\d+(?:\.\d+)?)\s*(?:hours|hrs)\b',
                r'timesheet\s*(?:value|hours|hrs)?\s*(?:to|=|:)\s*(\d+(?:\.\d+)?)']:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return float(m.group(1))
    return None


def extract_identifier(text):
    """Extract employee ID or name. Returns str or None."""
    m = re.search(r'(?:emp(?:loyee)?(?:\s*id)?[:\s]+|for\s+|of\s+)(\d{4,})', text, re.IGNORECASE)
    if m:
        return m.group(1)
    m = re.search(r'\b(\d{6,})\b', text)
    if m:
        return m.group(1)
    m = re.search(r'(?:for|of|employee)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)', text)
    if m:
        return m.group(1).strip()
    return None


def extract_leave_days(text):
    """Extract leave days from prompt. Returns float or None."""
    m = re.search(r'(\d+(?:\.\d+)?)\s*days?\s*(?:of\s*)?(?:leave|off|vacation)', text, re.IGNORECASE)
    if m:
        return float(m.group(1))
    m = re.search(r'(?:leave|off|vacation)\s*(?:for|of)?\s*(\d+(?:\.\d+)?)\s*days?', text, re.IGNORECASE)
    if m:
        return float(m.group(1))
    m = re.search(r'(?:leave|off)\s+from\s+(\w+\s+\d+)\s+to\s+(\w+\s+\d+)', text, re.IGNORECASE)
    if m:
        try:
            s = datetime.strptime(m.group(1) + " 2026", "%B %d %Y")
            e = datetime.strptime(m.group(2) + " 2026", "%B %d %Y")
            return max(1, (e - s).days + 1)
        except Exception:
            pass
    return None


def extract_permission_hours(text):
    """Extract permission hours from prompt (e.g., '2 hrs permission'). Returns float or None."""
    m = re.search(r'(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*permission', text, re.IGNORECASE)
    if m:
        return float(m.group(1))
    m = re.search(r'permission\s*(?:of|for)?\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)', text, re.IGNORECASE)
    if m:
        return float(m.group(1))
    return None


def is_half_day(text):
    """Detect if the prompt mentions half-day leave."""
    return bool(re.search(r'\bhalf\s*(?:day|a\s*day)\b|0\.5\s*day', text, re.IGNORECASE))


def extract_half(text):
    """Extract which half: 'first' or 'second'. Returns str or None."""
    if re.search(r'\b(?:first\s*half|morning|FN|forenoon)\b', text, re.IGNORECASE):
        return "first"
    if re.search(r'\b(?:second\s*half|afternoon|AN|afternoo\w*|evening)\b', text, re.IGNORECASE):
        return "second"
    return None
