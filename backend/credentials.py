"""credentials.py - AWS Bearer Token & Credential Management (shared across agents)"""
import os, base64
from urllib.parse import parse_qs, urlparse, unquote
from datetime import datetime, timedelta, timezone

REQUIRED_ENV_VARS = ["AWS_BEARER_TOKEN_BEDROCK", "AWS_REGION"]
REPORTED_ENV_VARS = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_DEFAULT_REGION", "AWS_SESSION_TOKEN"]


def validate_env():
    """Return list of missing required environment variables."""
    return [v for v in REQUIRED_ENV_VARS if not os.getenv(v)]


def extract_credentials():
    """Decode bearer token, set AWS env vars, return credential info dict."""
    encoded = os.getenv("AWS_BEARER_TOKEN_BEDROCK", "")
    if encoded.startswith("bedrock-api-key-"):
        encoded = encoded[len("bedrock-api-key-"):]
    padding = 4 - len(encoded) % 4
    if padding != 4:
        encoded += "=" * padding

    decoded_url = base64.b64decode(encoded).decode()
    if not decoded_url.startswith("http"):
        decoded_url = "https://" + decoded_url

    params = parse_qs(urlparse(decoded_url).query)
    cred_parts = params.get("X-Amz-Credential", [""])[0].split("/")
    access_key, cred_region = cred_parts[0], cred_parts[2]
    security_token = unquote(params.get("X-Amz-Security-Token", [""])[0])
    amz_date = params.get("X-Amz-Date", [""])[0]
    expires = int(params.get("X-Amz-Expires", ["0"])[0])

    token_time = datetime.strptime(amz_date, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    expiry_time = token_time + timedelta(seconds=expires)
    now = datetime.now(timezone.utc)
    if now > expiry_time:
        raise RuntimeError(f"Bearer token expired at {expiry_time} (now={now})")

    os.environ["AWS_ACCESS_KEY_ID"] = access_key
    os.environ["AWS_SECRET_ACCESS_KEY"] = access_key
    os.environ["AWS_SESSION_TOKEN"] = security_token
    os.environ["AWS_DEFAULT_REGION"] = cred_region
    return {"access_key": access_key, "region": cred_region, "expires": str(expiry_time), "remaining": str(expiry_time - now)}
