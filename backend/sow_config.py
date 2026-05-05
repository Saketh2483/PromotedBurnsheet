"""sow_config.py - SOW Stream rules for daily/monthly hours calculation"""

SOW_CONFIG = {
    "onshore":          {"monthly": 168, "daily": 8},
    "india":            {"monthly": 176, "daily": 9},
    "btm":              {"monthly": 168, "daily": 8},
    "offshore_onshore": {"monthly": 189, "daily": 10},
}


def determine_sow_stream(location, country):
    """Determine SOW stream from location and country strings."""
    loc = (location or "").upper()
    ctry = (country or "").upper()
    if "OFFSHORE" in loc:
        return "offshore_onshore"
    if "ONSHORE" in loc or "ONS" in loc or "ONPREM" in loc:
        return "onshore"
    if ctry == "INDIA":
        return "india"
    return "btm"


def get_daily_hours(sow):
    return SOW_CONFIG.get(sow, SOW_CONFIG["btm"])["daily"]


def get_monthly_hours(sow):
    return SOW_CONFIG.get(sow, SOW_CONFIG["btm"])["monthly"]
