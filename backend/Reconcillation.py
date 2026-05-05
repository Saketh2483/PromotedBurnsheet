"""Reconcillation.py - FastAPI orchestrator. Start: cd backend && python Reconcillation.py"""
import json, sys
from typing import Optional, List
from pathlib import Path
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except Exception: pass

from credentials import extract_credentials, validate_env, REPORTED_ENV_VARS
from pending_store import get_pending as _pending, set_pending, remove_pending, clear_pending
from agent_tools import reconcile_timesheet, read_employee_data, EXCEL_PATH
from parsers import extract_hours, extract_identifier
from leave_agent import router as leave_router
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import openpyxl

app = FastAPI(title="Reconciliation Agent API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(leave_router)

class AgentRequest(BaseModel):
    prompt: str = ""
class DirectReconcileRequest(BaseModel):
    identifier: str
    newTimesheetHrs: float

def _check_aws():
    m = validate_env()
    if m: raise HTTPException(503, f"Missing: {m}")
    extract_credentials()

@app.get("/health")
def health():
    m = validate_env()
    if m: return {"status": "error", "message": f"Missing: {m}", "checked_variables": REPORTED_ENV_VARS}
    try: return {"status": "ok", "credentials": extract_credentials(), "checked_variables": REPORTED_ENV_VARS}
    except Exception as e: return {"status": "error", "message": str(e), "checked_variables": REPORTED_ENV_VARS}

@app.post("/reconcile")
def reconcile(req: AgentRequest):
    _check_aws()
    prompt = req.prompt.strip()
    if not prompt: return {"status": "error", "response": "Please provide a message.", "excelUpdated": False}
    # Case 3: exactly "reconcile"
    if prompt.lower() == "reconcile":
        pending = _pending()
        if not pending: return {"status": "no_pending", "response": "No pending updates to reconcile. All data is already up to date.", "excelUpdated": False}
        updates = []
        for e in pending.values():
            r = json.loads(reconcile_timesheet(identifier=e["identifier"], new_timesheet_hrs=e["newTimesheetHrs"], update_excel=True))
            updates.extend(r.get("updates", []))
        clear_pending()
        return {"status": "success", "response": f"Reconciled {len(updates)} row(s).", "updates": updates, "excelUpdated": bool(updates)}
    # Parse
    has_rec = "reconcile" in prompt.lower()
    hrs = extract_hours(prompt)
    ident = extract_identifier(prompt)
    if not ident or hrs is None:
        msg = "Timesheet update saved for review. If you want to reconcile, then type reconcile." if has_rec else "Need employee identifier and hours."
        return {"status": "error", "response": msg, "excelUpdated": False}
    result = json.loads(reconcile_timesheet(identifier=ident, new_timesheet_hrs=hrs, update_excel=has_rec))
    updates = result.get("updates", [])
    if has_rec:  # Case 2
        for u in updates: remove_pending(u.get("empId", "").lower())
        return {"status": "success", "response": f"Reconciled {len(updates)} row(s). Excel updated.", "updates": updates, "excelUpdated": True}
    # Case 1
    for u in updates:
        set_pending(u.get("empId", ident).lower(), {"identifier": ident, "newTimesheetHrs": hrs, **u})
    resp = f"Timesheet update saved for review. If you want to reconcile, then type reconcile." if updates else result.get("error", "No match.")
    return {"status": result.get("status", "error"), "response": resp, "updates": updates, "excelUpdated": False}

@app.post("/reconcile-direct")
def reconcile_direct(req: DirectReconcileRequest):
    r = json.loads(reconcile_timesheet(identifier=req.identifier, new_timesheet_hrs=req.newTimesheetHrs, update_excel=True))
    for u in r.get("updates", []): remove_pending(u.get("empId", "").lower())
    return r

@app.post("/update-ui")
def update_ui(req: DirectReconcileRequest):
    r = json.loads(reconcile_timesheet(identifier=req.identifier, new_timesheet_hrs=req.newTimesheetHrs, update_excel=False))
    for u in r.get("updates", []):
        set_pending(u.get("empId", req.identifier).lower(), {"identifier": req.identifier, "newTimesheetHrs": req.newTimesheetHrs, **u})
    r["pending"] = True
    return r

@app.get("/pending")
def get_pending_ep():
    p = _pending()
    return {"pending": list(p.values()), "count": len(p)}

@app.get("/employee/{identifier}")
def get_employee(identifier: str):
    return json.loads(read_employee_data(identifier=identifier))

@app.get("/data")
def get_all_data():
    if not EXCEL_PATH.exists(): raise HTTPException(404, "Excel not found")
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
    rows = [list(r) for r in wb.active.iter_rows(min_row=2, values_only=True)]
    wb.close()
    return {"data": rows}

if __name__ == "__main__":
    import uvicorn
    m = validate_env()
    if m: print(f"[FAIL] Missing: {m}"); sys.exit(1)
    try: c = extract_credentials(); print(f"[OK] Token valid - expires {c['expires']}, region {c['region']}")
    except Exception as e: print(f"[FAIL] {e}"); sys.exit(1)
    print(f"[OK] Excel: {'found' if EXCEL_PATH.exists() else 'NOT found'} | Pending: {len(_pending())}")
    uvicorn.run(app, host="0.0.0.0", port=8000)
