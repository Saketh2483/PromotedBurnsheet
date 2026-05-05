"""leave_agent.py - Leave Management Agent (leave & permission only, never writes Excel)
Requires explicit CONFIRM/CANCEL before creating pending updates."""
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from sow_config import get_daily_hours, get_monthly_hours
from pending_store import get_pending, set_pending
from agent_tools import get_employee_sow_info

router = APIRouter(prefix="/leave", tags=["Leave Management"])

# Persistent awaiting-confirmation store
_AWAIT_FILE = Path(__file__).resolve().parent.parent / "_leave_awaiting.json"


def _load_awaiting():
    if _AWAIT_FILE.exists():
        try: return json.loads(_AWAIT_FILE.read_text(encoding="utf-8"))
        except Exception: pass
    return {}


def _save_awaiting(data):
    _AWAIT_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


class LeaveRequest(BaseModel):
    identifier: str
    leave_days: Optional[float] = None
    permission_hours: Optional[float] = None
    half: Optional[str] = None  # "first" or "second" (required for half-day)
    leave_date: Optional[str] = None  # date or date range


class ConfirmRequest(BaseModel):
    identifier: str
    action: str  # "confirm" or "cancel"


class LeaveResponse(BaseModel):
    status: str
    message: str
    employeeName: Optional[str] = None
    empId: Optional[str] = None
    sowStream: Optional[str] = None
    dailyHours: Optional[float] = None
    leaveDays: Optional[float] = None
    permissionHours: Optional[float] = None
    hoursDeducted: Optional[float] = None
    originalTimesheet: Optional[float] = None
    adjustedTimesheet: Optional[float] = None
    leaveType: Optional[str] = None
    excelUpdated: bool = False
    requiresConfirmation: bool = False


@router.get("/info/{identifier}")
def get_leave_info(identifier: str):
    """Get employee SOW info and leave rules."""
    info = get_employee_sow_info(identifier)
    if not info:
        raise HTTPException(status_code=404, detail=f"Employee '{identifier}' not found.")
    sow = info["sowStream"]
    return {"status": "ok", "employee": info, "leaveRules": {
        "sowStream": sow, "dailyHours": get_daily_hours(sow), "monthlyHours": get_monthly_hours(sow),
        "note": f"Deduction = days x {get_daily_hours(sow)} hrs/day ({sow} SOW)"}}


@router.post("/", response_model=LeaveResponse)
def process_leave(req: LeaveRequest):
    """Validate leave request and ask for confirmation. Never writes Excel."""
    if not req.identifier or not req.identifier.strip():
        return LeaveResponse(status="error", message="Employee identifier (EMPId or name) is required.")
    if req.leave_days is None and req.permission_hours is None:
        return LeaveResponse(status="error", message="Provide either leave_days or permission_hours.")
    if req.leave_days is not None and req.leave_days <= 0:
        return LeaveResponse(status="error", message="Leave days must be greater than 0.")
    if req.permission_hours is not None and req.permission_hours <= 0:
        return LeaveResponse(status="error", message="Permission hours must be greater than 0.")

    # Dynamic querying: half-day requires half specification
    is_half_day = req.leave_days is not None and req.leave_days == 0.5
    if is_half_day and not req.half:
        return LeaveResponse(status="query", message="Please confirm which half of the day:\n\n1. First Half / Morning\n2. Second Half / Afternoon")

    # Dynamic querying: leave date required
    if req.leave_days is not None and not req.leave_date:
        return LeaveResponse(status="query", message="Please provide the leave date (or date range) for the leave.")

    info = get_employee_sow_info(req.identifier)
    if not info:
        return LeaveResponse(status="error", message=f"Employee '{req.identifier}' not found.")

    daily = info["dailyHours"]
    is_permission = req.permission_hours is not None
    is_half_day = req.leave_days is not None and req.leave_days == 0.5
    deducted = req.permission_hours if is_permission else req.leave_days * daily
    adjusted = round(info["currentTimesheet"] - deducted, 2)

    if adjusted < 0:
        return LeaveResponse(status="error",
            message=f"Cannot deduct {deducted} hrs. Current timesheet is {info['currentTimesheet']} hrs.")

    # Determine leave type
    if is_permission:
        leave_type = "Permission"
    elif is_half_day:
        leave_type = f"Half Day ({req.half.capitalize()})"
    else:
        leave_type = "Full Day"

    # Check existing pending
    emp_key = info["empId"].lower()
    if emp_key in get_pending():
        return LeaveResponse(status="error",
            message=f"Pending update already exists for {info['name']} ({info['empId']}). Reconcile first.")

    # Store in awaiting-confirmation (DO NOT create pending yet)
    awaiting = _load_awaiting()
    awaiting[emp_key] = {
        "identifier": req.identifier, "empId": info["empId"], "name": info["name"],
        "leaveDays": req.leave_days, "permissionHours": req.permission_hours,
        "dailyHours": daily, "deducted": deducted, "adjusted": adjusted,
        "originalTimesheet": info["currentTimesheet"], "sowStream": info["sowStream"],
        "rateUsd": info["rateUsd"], "projectedRate": info["projectedRate"],
        "leaveType": leave_type, "leaveDate": req.leave_date, "half": req.half
    }
    _save_awaiting(awaiting)

    msg = (f"{info['name']} ({info['empId']}) - {leave_type}: "
           f"{'%.1f' % deducted} hrs deduction ({info['currentTimesheet']} → {adjusted} hrs).\n"
           f"Date: {req.leave_date or 'N/A'}\n\n"
           "Please confirm if you want to proceed with this leave request.\n"
           "Reply with CONFIRM to proceed or CANCEL to discard.")

    return LeaveResponse(status="awaiting_confirmation", message=msg,
        employeeName=info["name"], empId=info["empId"], sowStream=info["sowStream"],
        dailyHours=daily, leaveDays=req.leave_days, permissionHours=req.permission_hours,
        hoursDeducted=deducted, originalTimesheet=info["currentTimesheet"],
        adjustedTimesheet=adjusted, leaveType=leave_type,
        excelUpdated=False, requiresConfirmation=True)


@router.post("/confirm", response_model=LeaveResponse)
def confirm_leave(req: ConfirmRequest):
    """Handle CONFIRM or CANCEL for a pending leave request."""
    emp_key = req.identifier.strip().lower()
    awaiting = _load_awaiting()

    # Find by empId or name
    entry = awaiting.get(emp_key)
    if not entry:
        for k, v in awaiting.items():
            if emp_key in v.get("name", "").lower() or emp_key == v.get("empId", "").lower():
                entry = v; emp_key = k; break
    if not entry:
        return LeaveResponse(status="error",
            message="No pending leave request found for this employee. Submit a leave request first.")

    action = req.action.strip().lower()

    if action in ("cancel", "no"):
        awaiting.pop(emp_key, None)
        _save_awaiting(awaiting)
        return LeaveResponse(status="cancelled",
            message="Leave request was cancelled. No changes were made.",
            employeeName=entry["name"], empId=entry["empId"], excelUpdated=False)

    if action not in ("confirm", "yes", "yes, confirm"):
        return LeaveResponse(status="awaiting_confirmation",
            message="Please reply with CONFIRM to proceed or CANCEL to discard.",
            requiresConfirmation=True)

    # CONFIRM: create persistent pending update
    new_actual = round(entry["rateUsd"] * entry["adjusted"], 2)
    set_pending(emp_key, {
        "identifier": entry["identifier"], "newTimesheetHrs": entry["adjusted"],
        "empId": entry["empId"], "name": entry["name"],
        "oldTimesheetHrs": entry["originalTimesheet"],
        "newActualRate": new_actual,
        "newVariance": round(new_actual - entry["projectedRate"], 2),
        "leaveDeduction": {
            "leaveDays": entry["leaveDays"], "permissionHours": entry["permissionHours"],
            "dailyHours": entry["dailyHours"], "hoursDeducted": entry["deducted"],
            "sowStream": entry["sowStream"],
            "originalTimesheet": entry["originalTimesheet"],
            "adjustedTimesheet": entry["adjusted"]}})

    # Remove from awaiting
    awaiting.pop(emp_key, None)
    _save_awaiting(awaiting)

    return LeaveResponse(status="confirmed",
        message="Leave recorded successfully. Pending reconciliation is required to apply changes.",
        employeeName=entry["name"], empId=entry["empId"], sowStream=entry["sowStream"],
        dailyHours=entry["dailyHours"], leaveDays=entry["leaveDays"],
        permissionHours=entry["permissionHours"], hoursDeducted=entry["deducted"],
        originalTimesheet=entry["originalTimesheet"], adjustedTimesheet=entry["adjusted"],
        leaveType=entry["leaveType"], excelUpdated=False)
