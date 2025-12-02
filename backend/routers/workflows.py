import asyncio
import time
import uuid
from enum import Enum
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/workflows", tags=["workflows"])

# In-memory storage for workflow state
workflows: dict[str, dict] = {}
event_logs: dict[str, list] = {}


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    COMPENSATING = "compensating"
    COMPENSATED = "compensated"


class WorkflowStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLING_BACK = "rolling_back"
    ROLLED_BACK = "rolled_back"


# ============ Saga Pattern Demo ============

SAGA_STEPS = [
    {"name": "Reserve Inventory", "compensation": "Release Inventory", "duration": 0.8},
    {"name": "Charge Payment", "compensation": "Refund Payment", "duration": 1.0},
    {"name": "Create Shipping Label", "compensation": "Cancel Shipping", "duration": 0.6},
    {"name": "Send Confirmation", "compensation": "Send Cancellation", "duration": 0.4},
]


class SagaRequest(BaseModel):
    fail_at_step: int | None = None  # 0-indexed, None means success


@router.post("/saga/start")
async def start_saga(request: SagaRequest):
    """Start a new saga workflow."""
    workflow_id = str(uuid.uuid4())[:8]

    workflows[workflow_id] = {
        "id": workflow_id,
        "type": "saga",
        "status": WorkflowStatus.RUNNING,
        "fail_at_step": request.fail_at_step,
        "current_step": 0,
        "steps": [
            {
                "name": step["name"],
                "compensation": step["compensation"],
                "status": StepStatus.PENDING,
            }
            for step in SAGA_STEPS
        ],
        "created_at": time.time(),
    }
    event_logs[workflow_id] = []

    return {"workflow_id": workflow_id, "status": "started"}


@router.post("/saga/{workflow_id}/step")
async def execute_saga_step(workflow_id: str):
    """Execute the next step in the saga."""
    if workflow_id not in workflows:
        return {"error": "Workflow not found"}

    wf = workflows[workflow_id]
    logs = event_logs[workflow_id]

    if wf["status"] == WorkflowStatus.COMPLETED:
        return {"status": "already_completed"}

    if wf["status"] == WorkflowStatus.ROLLED_BACK:
        return {"status": "already_rolled_back"}

    # Handle rollback mode
    if wf["status"] == WorkflowStatus.ROLLING_BACK:
        # Find the next step to compensate (going backwards)
        for i in range(len(wf["steps"]) - 1, -1, -1):
            step = wf["steps"][i]
            if step["status"] == StepStatus.COMPLETED:
                step["status"] = StepStatus.COMPENSATING
                logs.append({
                    "timestamp": time.time(),
                    "event": f"Compensating: {step['compensation']}",
                    "type": "compensate",
                })

                await asyncio.sleep(0.5)

                step["status"] = StepStatus.COMPENSATED
                logs.append({
                    "timestamp": time.time(),
                    "event": f"Compensated: {step['compensation']}",
                    "type": "compensated",
                })

                # Check if all compensations done
                all_compensated = all(
                    s["status"] in [StepStatus.COMPENSATED, StepStatus.PENDING, StepStatus.FAILED]
                    for s in wf["steps"]
                )
                if all_compensated:
                    wf["status"] = WorkflowStatus.ROLLED_BACK
                    logs.append({
                        "timestamp": time.time(),
                        "event": "Saga rolled back completely",
                        "type": "rollback_complete",
                    })

                return {"status": "compensating", "step": step["compensation"]}

        return {"status": "rollback_complete"}

    # Normal execution mode
    current = wf["current_step"]
    if current >= len(wf["steps"]):
        wf["status"] = WorkflowStatus.COMPLETED
        return {"status": "completed"}

    step = wf["steps"][current]
    step["status"] = StepStatus.RUNNING

    logs.append({
        "timestamp": time.time(),
        "event": f"Executing: {step['name']}",
        "type": "start",
    })

    # Simulate work
    await asyncio.sleep(SAGA_STEPS[current]["duration"])

    # Check if this step should fail
    if wf["fail_at_step"] == current:
        step["status"] = StepStatus.FAILED
        wf["status"] = WorkflowStatus.ROLLING_BACK

        logs.append({
            "timestamp": time.time(),
            "event": f"FAILED: {step['name']}",
            "type": "error",
        })
        logs.append({
            "timestamp": time.time(),
            "event": "Starting compensation...",
            "type": "rollback_start",
        })

        return {"status": "failed", "step": step["name"], "rolling_back": True}

    step["status"] = StepStatus.COMPLETED
    wf["current_step"] = current + 1

    logs.append({
        "timestamp": time.time(),
        "event": f"Completed: {step['name']}",
        "type": "success",
    })

    if wf["current_step"] >= len(wf["steps"]):
        wf["status"] = WorkflowStatus.COMPLETED
        logs.append({
            "timestamp": time.time(),
            "event": "Saga completed successfully!",
            "type": "complete",
        })

    return {"status": "step_completed", "step": step["name"]}


@router.get("/saga/{workflow_id}")
async def get_saga_state(workflow_id: str):
    """Get current state of a saga workflow."""
    if workflow_id not in workflows:
        return {"error": "Workflow not found"}

    wf = workflows[workflow_id]
    logs = event_logs.get(workflow_id, [])

    return {
        "workflow": wf,
        "logs": logs,
    }


# ============ Event Sourcing Demo ============

event_store: dict[str, list] = {}
projections: dict[str, dict] = {}


class EventCommand(BaseModel):
    aggregate_id: str
    event_type: str
    data: dict


@router.post("/events/append")
async def append_event(cmd: EventCommand):
    """Append an event to the event store."""
    if cmd.aggregate_id not in event_store:
        event_store[cmd.aggregate_id] = []
        projections[cmd.aggregate_id] = {"balance": 0, "version": 0}

    event = {
        "id": str(uuid.uuid4())[:8],
        "aggregate_id": cmd.aggregate_id,
        "type": cmd.event_type,
        "data": cmd.data,
        "timestamp": time.time(),
        "version": len(event_store[cmd.aggregate_id]) + 1,
    }

    event_store[cmd.aggregate_id].append(event)

    # Update projection
    proj = projections[cmd.aggregate_id]
    if cmd.event_type == "deposit":
        proj["balance"] += cmd.data.get("amount", 0)
    elif cmd.event_type == "withdraw":
        proj["balance"] -= cmd.data.get("amount", 0)
    proj["version"] = event["version"]

    return {"event": event, "projection": proj}


@router.get("/events/{aggregate_id}")
async def get_events(aggregate_id: str):
    """Get all events for an aggregate."""
    events = event_store.get(aggregate_id, [])
    projection = projections.get(aggregate_id, {"balance": 0, "version": 0})

    return {
        "events": events,
        "projection": projection,
    }


@router.post("/events/{aggregate_id}/replay")
async def replay_events(aggregate_id: str):
    """Replay events to rebuild projection."""
    events = event_store.get(aggregate_id, [])

    # Reset projection
    proj = {"balance": 0, "version": 0}

    replay_log = []
    for event in events:
        if event["type"] == "deposit":
            proj["balance"] += event["data"].get("amount", 0)
        elif event["type"] == "withdraw":
            proj["balance"] -= event["data"].get("amount", 0)
        proj["version"] = event["version"]

        replay_log.append({
            "event": event["type"],
            "amount": event["data"].get("amount", 0),
            "balance_after": proj["balance"],
        })

    projections[aggregate_id] = proj

    return {
        "replay_log": replay_log,
        "final_projection": proj,
    }


@router.delete("/events/{aggregate_id}")
async def clear_events(aggregate_id: str):
    """Clear events for an aggregate."""
    if aggregate_id in event_store:
        del event_store[aggregate_id]
    if aggregate_id in projections:
        del projections[aggregate_id]
    return {"status": "cleared"}


# ============ Durable Execution Demo ============

durable_workflows: dict[str, dict] = {}


class DurableWorkflowRequest(BaseModel):
    steps: list[str]


@router.post("/durable/start")
async def start_durable_workflow(request: DurableWorkflowRequest):
    """Start a durable workflow that can survive crashes."""
    workflow_id = str(uuid.uuid4())[:8]

    durable_workflows[workflow_id] = {
        "id": workflow_id,
        "status": "running",
        "steps": request.steps,
        "history": [],  # Completed step results
        "current_step": 0,
        "created_at": time.time(),
    }

    return {"workflow_id": workflow_id}


@router.post("/durable/{workflow_id}/execute")
async def execute_durable_step(workflow_id: str, crash_after: bool = False):
    """Execute next step. If crash_after=True, simulate crash after step."""
    if workflow_id not in durable_workflows:
        return {"error": "Workflow not found"}

    wf = durable_workflows[workflow_id]

    if wf["current_step"] >= len(wf["steps"]):
        wf["status"] = "completed"
        return {"status": "completed", "history": wf["history"]}

    step_name = wf["steps"][wf["current_step"]]

    # Simulate step execution
    await asyncio.sleep(0.5)

    result = {
        "step": step_name,
        "result": f"Result of {step_name}",
        "executed_at": time.time(),
    }

    # Record in history (this is what makes it durable)
    wf["history"].append(result)
    wf["current_step"] += 1

    if crash_after:
        # Simulate crash - workflow state is preserved
        return {
            "status": "crashed",
            "message": "Worker crashed after step completed. State preserved in history.",
            "history": wf["history"],
        }

    if wf["current_step"] >= len(wf["steps"]):
        wf["status"] = "completed"

    return {
        "status": "step_completed",
        "step": step_name,
        "result": result,
        "remaining": len(wf["steps"]) - wf["current_step"],
    }


@router.post("/durable/{workflow_id}/recover")
async def recover_durable_workflow(workflow_id: str):
    """Recover workflow from history after crash."""
    if workflow_id not in durable_workflows:
        return {"error": "Workflow not found"}

    wf = durable_workflows[workflow_id]

    return {
        "status": "recovered",
        "completed_steps": len(wf["history"]),
        "remaining_steps": len(wf["steps"]) - wf["current_step"],
        "history": wf["history"],
        "next_step": wf["steps"][wf["current_step"]] if wf["current_step"] < len(wf["steps"]) else None,
    }


@router.get("/durable/{workflow_id}")
async def get_durable_workflow(workflow_id: str):
    """Get durable workflow state."""
    if workflow_id not in durable_workflows:
        return {"error": "Workflow not found"}

    return durable_workflows[workflow_id]


# ============ Reset ============

@router.post("/reset")
async def reset_all():
    """Reset all workflow state."""
    workflows.clear()
    event_logs.clear()
    event_store.clear()
    projections.clear()
    durable_workflows.clear()
    return {"status": "reset"}
