"""
Bedrock Agent Test - Bearer Token (Pre-signed URL) approach
"""
import os
import sys
import json
import base64
from urllib.parse import parse_qs, urlparse, unquote
from datetime import datetime, timedelta, timezone

os.environ["PYTHONUNBUFFERED"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

from dotenv import load_dotenv
load_dotenv()

bearer_token = os.getenv("AWS_BEARER_TOKEN_BEDROCK", "")
region = os.getenv("AWS_REGION", "us-west-1")

print("=" * 60)
print("BEDROCK AGENT CONNECTION TEST")
print("=" * 60)
print("Region: " + region)
print("Bearer token length: " + str(len(bearer_token)))

# --- Step 1: Decode the bearer token ---
print("\n--- Step 1: Decode bearer token ---")

encoded_part = bearer_token
if encoded_part.startswith("bedrock-api-key-"):
    encoded_part = encoded_part[len("bedrock-api-key-"):]

padding = 4 - len(encoded_part) % 4
if padding != 4:
    encoded_part += "=" * padding

decoded_url = base64.b64decode(encoded_part).decode("utf-8")

if not decoded_url.startswith("http"):
    full_url = "https://" + decoded_url
else:
    full_url = decoded_url

parsed = urlparse(full_url)
params = parse_qs(parsed.query)

credential = params.get("X-Amz-Credential", [""])[0]
security_token = unquote(params.get("X-Amz-Security-Token", [""])[0])
amz_date = params.get("X-Amz-Date", [""])[0]
expires = params.get("X-Amz-Expires", [""])[0]
signature = params.get("X-Amz-Signature", [""])[0]

cred_parts = credential.split("/")
access_key_id = cred_parts[0]
cred_date = cred_parts[1]
cred_region = cred_parts[2]
cred_service = cred_parts[3]

print("  Host: " + str(parsed.hostname))
print("  Action: " + params.get("Action", ["?"])[0])
print("  Access Key: " + access_key_id)
print("  Region: " + cred_region)
print("  Service: " + cred_service)
print("  Date: " + amz_date)
print("  Expires: " + expires + "s")
print("  Signature: " + signature[:20] + "...")
print("  Session Token length: " + str(len(security_token)))

# Check expiry
token_time = datetime.strptime(amz_date, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
expiry_time = token_time + timedelta(seconds=int(expires))
now = datetime.now(timezone.utc)
remaining = expiry_time - now
print("\n  Token issued:  " + str(token_time))
print("  Token expires: " + str(expiry_time))
print("  Current time:  " + str(now))
print("  Time remaining: " + str(remaining))

if now > expiry_time:
    print("\n  *** TOKEN IS EXPIRED ***")
    sys.exit(1)
else:
    print("  Token is VALID")

# --- Step 2: Test pre-signed URL via HTTPS ---
print("\n--- Step 2: Test pre-signed URL via HTTPS ---")

import urllib.request
import urllib.error

try:
    req = urllib.request.Request(full_url, method="GET")
    req.add_header("Host", parsed.hostname)
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = resp.read().decode("utf-8")
        print("  HTTP " + str(resp.status) + " - Response length: " + str(len(body)))
        print("  Response (first 500 chars): " + body[:500])
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8", errors="replace")
    print("  HTTP " + str(e.code) + " " + str(e.reason))
    print("  Response: " + body[:500])
except Exception as e:
    print("  Request failed: " + type(e).__name__ + ": " + str(e))

# --- Step 3: Try boto3 with extracted temporary credentials ---
print("\n--- Step 3: Test boto3 bedrock-runtime ---")

try:
    import boto3
    from botocore.config import Config

    os.environ["AWS_ACCESS_KEY_ID"] = access_key_id
    os.environ["AWS_SESSION_TOKEN"] = security_token
    os.environ["AWS_DEFAULT_REGION"] = cred_region

    print("\n  Attempt A: boto3 bedrock-runtime (env creds)...")
    try:
        bedrock_client = boto3.client(
            "bedrock-runtime",
            region_name=cred_region,
            config=Config(
                retries={"max_attempts": 1},
                connect_timeout=10,
                read_timeout=30,
            ),
        )
        resp = bedrock_client.invoke_model(
            modelId="anthropic.claude-sonnet-4-20250514-v1:0",
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 100,
                "messages": [{"role": "user", "content": "Say hello in one sentence."}],
            }),
        )
        result = json.loads(resp["body"].read())
        print("  SUCCESS: " + json.dumps(result))
    except Exception as e:
        print("  Failed: " + type(e).__name__ + ": " + str(e)[:300])

    print("\n  Attempt B: Direct HTTPS to bedrock-runtime...")
    try:
        model_id = "anthropic.claude-sonnet-4-20250514-v1:0"
        endpoint = "https://bedrock-runtime." + cred_region + ".amazonaws.com/model/" + model_id + "/invoke"
        payload = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 100,
            "messages": [{"role": "user", "content": "Say hello in one sentence."}],
        }).encode("utf-8")

        req = urllib.request.Request(endpoint, data=payload, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json")
        req.add_header("Authorization", "Bearer " + bearer_token)

        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            print("  SUCCESS: " + json.dumps(result))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print("  HTTP " + str(e.code) + ": " + body[:300])
    except Exception as e:
        print("  Failed: " + type(e).__name__ + ": " + str(e)[:300])

except ImportError as e:
    print("  Import error: " + str(e))

# --- Step 4: Strands SDK Agent test ---
print("\n--- Step 4: Strands SDK Agent test ---")

try:
    from strands import Agent
    from strands.models.bedrock import BedrockModel

    bedrock_model = BedrockModel(
        model_id="anthropic.claude-sonnet-4-20250514-v1:0",
        region_name=cred_region,
    )
    agent = Agent(model=bedrock_model)
    print("  Sending test prompt to agent...")
    response = agent("Hello! Just testing. Reply with a short greeting.")
    print("\n  Agent response: " + str(response))

except Exception as e:
    print("  Strands Agent failed: " + type(e).__name__ + ": " + str(e)[:300])

print("\n" + "=" * 60)
print("TEST COMPLETE")
print("=" * 60)
