import asyncio
import time
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import (
    get_connection,
    reset_database,
    log_transaction,
    get_recent_logs,
    distributed_locks,
    lock_mutex,
)

router = APIRouter(prefix="/api/contention", tags=["contention"])


# ============ Pessimistic Locking Demo ============
# Simulates SELECT ... FOR UPDATE behavior

class TransferRequest(BaseModel):
    amount: int
    client_id: str


@router.get("/pessimistic/state")
async def get_pessimistic_state():
    """Get current account state and logs."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT balance, locked_by, locked_at FROM accounts WHERE id = 1")
        row = cursor.fetchone()
        return {
            "balance": row["balance"],
            "locked_by": row["locked_by"],
            "locked_at": row["locked_at"],
            "logs": get_recent_logs("pessimistic"),
        }


@router.post("/pessimistic/lock")
async def acquire_pessimistic_lock(client_id: str):
    """Attempt to acquire a lock on the account (SELECT ... FOR UPDATE simulation)."""
    with get_connection() as conn:
        cursor = conn.cursor()

        # Check if already locked
        cursor.execute("SELECT locked_by, locked_at FROM accounts WHERE id = 1")
        row = cursor.fetchone()

        if row["locked_by"] and row["locked_by"] != client_id:
            # Check if lock is stale (> 30 seconds)
            if time.time() - (row["locked_at"] or 0) < 30:
                log_transaction("pessimistic", "LOCK_BLOCKED", f"{client_id} blocked by {row['locked_by']}", False)
                return {
                    "success": False,
                    "message": f"Account locked by {row['locked_by']}",
                    "holder": row["locked_by"],
                }

        # Acquire lock
        cursor.execute(
            "UPDATE accounts SET locked_by = ?, locked_at = ? WHERE id = 1",
            (client_id, time.time())
        )
        conn.commit()
        log_transaction("pessimistic", "LOCK_ACQUIRED", f"{client_id} acquired lock", True)

        return {"success": True, "message": "Lock acquired", "holder": client_id}


@router.post("/pessimistic/withdraw")
async def pessimistic_withdraw(request: TransferRequest):
    """Withdraw with pessimistic locking - must hold lock first."""
    with get_connection() as conn:
        cursor = conn.cursor()

        # Verify lock ownership
        cursor.execute("SELECT balance, locked_by FROM accounts WHERE id = 1")
        row = cursor.fetchone()

        if row["locked_by"] != request.client_id:
            log_transaction("pessimistic", "WITHDRAW_DENIED", f"{request.client_id} doesn't hold lock", False)
            raise HTTPException(status_code=403, detail="You don't hold the lock")

        if row["balance"] < request.amount:
            log_transaction("pessimistic", "WITHDRAW_FAILED", f"Insufficient funds: {row['balance']} < {request.amount}", False)
            raise HTTPException(status_code=400, detail="Insufficient funds")

        # Simulate some processing time
        await asyncio.sleep(0.5)

        new_balance = row["balance"] - request.amount
        cursor.execute("UPDATE accounts SET balance = ? WHERE id = 1", (new_balance,))
        conn.commit()

        log_transaction("pessimistic", "WITHDRAW_SUCCESS", f"{request.client_id} withdrew {request.amount}, new balance: {new_balance}", True)
        return {"success": True, "new_balance": new_balance, "amount": request.amount}


@router.post("/pessimistic/release")
async def release_pessimistic_lock(client_id: str):
    """Release the lock on the account."""
    with get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT locked_by FROM accounts WHERE id = 1")
        row = cursor.fetchone()

        if row["locked_by"] != client_id:
            return {"success": False, "message": "You don't hold the lock"}

        cursor.execute("UPDATE accounts SET locked_by = NULL, locked_at = NULL WHERE id = 1")
        conn.commit()
        log_transaction("pessimistic", "LOCK_RELEASED", f"{client_id} released lock", True)

        return {"success": True, "message": "Lock released"}


# ============ Optimistic Concurrency Control Demo ============
# Uses version numbers to detect conflicts

class InventoryUpdate(BaseModel):
    quantity_change: int
    expected_version: int
    client_id: str


@router.get("/optimistic/state")
async def get_optimistic_state():
    """Get current inventory state and logs."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT product, quantity, version FROM inventory WHERE id = 1")
        row = cursor.fetchone()
        return {
            "product": row["product"],
            "quantity": row["quantity"],
            "version": row["version"],
            "logs": get_recent_logs("optimistic"),
        }


@router.post("/optimistic/update")
async def optimistic_update(request: InventoryUpdate):
    """Update inventory with optimistic concurrency control."""
    with get_connection() as conn:
        cursor = conn.cursor()

        # Simulate reading data and preparing update
        cursor.execute("SELECT quantity, version FROM inventory WHERE id = 1")
        row = cursor.fetchone()

        # Simulate some processing delay to increase conflict chance
        await asyncio.sleep(0.3)

        # Check version hasn't changed
        if row["version"] != request.expected_version:
            log_transaction(
                "optimistic",
                "VERSION_CONFLICT",
                f"{request.client_id}: expected v{request.expected_version}, found v{row['version']}",
                False
            )
            return {
                "success": False,
                "error": "version_conflict",
                "message": f"Version conflict! Expected {request.expected_version}, found {row['version']}",
                "current_version": row["version"],
                "current_quantity": row["quantity"],
            }

        new_quantity = row["quantity"] + request.quantity_change
        if new_quantity < 0:
            log_transaction("optimistic", "INVALID_QUANTITY", f"Would result in negative quantity: {new_quantity}", False)
            return {
                "success": False,
                "error": "insufficient_quantity",
                "message": "Insufficient inventory",
            }

        new_version = row["version"] + 1

        # Atomic update with version check
        cursor.execute(
            "UPDATE inventory SET quantity = ?, version = ? WHERE id = 1 AND version = ?",
            (new_quantity, new_version, request.expected_version)
        )

        if cursor.rowcount == 0:
            # Another transaction beat us
            log_transaction("optimistic", "RACE_CONDITION", f"{request.client_id} lost race during commit", False)
            return {
                "success": False,
                "error": "version_conflict",
                "message": "Lost race condition during commit",
            }

        conn.commit()
        action = "INCREASE" if request.quantity_change > 0 else "DECREASE"
        log_transaction(
            "optimistic",
            f"UPDATE_{action}",
            f"{request.client_id}: {request.quantity_change:+d}, v{request.expected_version}→v{new_version}, qty: {new_quantity}",
            True
        )

        return {
            "success": True,
            "new_quantity": new_quantity,
            "new_version": new_version,
        }


# ============ Distributed Lock Demo ============
# Simulates Redis-style distributed locks with TTL

LOCK_TTL_SECONDS = 10


@router.get("/distributed/state")
async def get_distributed_state():
    """Get current distributed lock state."""
    with lock_mutex:
        lock_info = distributed_locks.get("resource_1")
        if lock_info and time.time() > lock_info["expires_at"]:
            del distributed_locks["resource_1"]
            lock_info = None

    return {
        "resource": "resource_1",
        "lock": {
            "holder": lock_info["holder"] if lock_info else None,
            "expires_at": lock_info["expires_at"] if lock_info else None,
            "ttl_remaining": max(0, lock_info["expires_at"] - time.time()) if lock_info else 0,
        } if lock_info else None,
        "logs": get_recent_logs("distributed"),
    }


@router.post("/distributed/acquire")
async def acquire_distributed_lock(client_id: str, ttl: int = LOCK_TTL_SECONDS):
    """Try to acquire a distributed lock (like Redis SETNX with TTL)."""
    with lock_mutex:
        lock_info = distributed_locks.get("resource_1")

        # Check if lock exists and is not expired
        if lock_info:
            if time.time() < lock_info["expires_at"]:
                if lock_info["holder"] == client_id:
                    # Extend TTL if same holder
                    lock_info["expires_at"] = time.time() + ttl
                    log_transaction("distributed", "LOCK_EXTENDED", f"{client_id} extended TTL", True)
                    return {
                        "success": True,
                        "message": "Lock extended",
                        "expires_at": lock_info["expires_at"],
                        "ttl": ttl,
                    }
                else:
                    log_transaction("distributed", "LOCK_BLOCKED", f"{client_id} blocked by {lock_info['holder']}", False)
                    return {
                        "success": False,
                        "message": f"Lock held by {lock_info['holder']}",
                        "holder": lock_info["holder"],
                        "ttl_remaining": lock_info["expires_at"] - time.time(),
                    }
            else:
                # Lock expired, clean it up
                log_transaction("distributed", "LOCK_EXPIRED", f"Lock by {lock_info['holder']} expired", True)
                del distributed_locks["resource_1"]

        # Acquire the lock
        expires_at = time.time() + ttl
        distributed_locks["resource_1"] = {
            "holder": client_id,
            "expires_at": expires_at,
            "lock_id": str(uuid.uuid4())[:8],
        }
        log_transaction("distributed", "LOCK_ACQUIRED", f"{client_id} acquired lock (TTL: {ttl}s)", True)

        return {
            "success": True,
            "message": "Lock acquired",
            "expires_at": expires_at,
            "ttl": ttl,
        }


@router.post("/distributed/release")
async def release_distributed_lock(client_id: str):
    """Release a distributed lock."""
    with lock_mutex:
        lock_info = distributed_locks.get("resource_1")

        if not lock_info:
            return {"success": False, "message": "No lock exists"}

        if lock_info["holder"] != client_id:
            log_transaction("distributed", "RELEASE_DENIED", f"{client_id} can't release lock held by {lock_info['holder']}", False)
            return {"success": False, "message": "You don't hold this lock"}

        del distributed_locks["resource_1"]
        log_transaction("distributed", "LOCK_RELEASED", f"{client_id} released lock", True)

        return {"success": True, "message": "Lock released"}


@router.post("/distributed/work")
async def do_distributed_work(client_id: str, duration: float = 2.0):
    """Simulate doing work while holding the lock."""
    with lock_mutex:
        lock_info = distributed_locks.get("resource_1")

        if not lock_info or lock_info["holder"] != client_id:
            log_transaction("distributed", "WORK_DENIED", f"{client_id} tried to work without lock", False)
            raise HTTPException(status_code=403, detail="You don't hold the lock")

        if time.time() > lock_info["expires_at"]:
            log_transaction("distributed", "LOCK_EXPIRED", f"{client_id}'s lock expired during work", False)
            del distributed_locks["resource_1"]
            raise HTTPException(status_code=410, detail="Lock expired")

    log_transaction("distributed", "WORK_STARTED", f"{client_id} started work ({duration}s)", True)

    # Simulate work
    await asyncio.sleep(duration)

    # Check lock still held after work
    with lock_mutex:
        lock_info = distributed_locks.get("resource_1")
        if not lock_info or lock_info["holder"] != client_id:
            log_transaction("distributed", "WORK_INTERRUPTED", f"{client_id}'s lock was taken during work", False)
            return {"success": False, "message": "Lock lost during work"}

    log_transaction("distributed", "WORK_COMPLETED", f"{client_id} completed work", True)
    return {"success": True, "message": "Work completed successfully"}


# ============ Utility Endpoints ============

@router.post("/reset")
async def reset_all():
    """Reset all demo data to initial state."""
    result = reset_database()
    return result


@router.get("/info")
async def get_contention_info():
    """Returns information about contention handling mechanisms."""
    return {
        "single_node": {
            "atomicity": {
                "name": "Atomicity (Database Transactions)",
                "description": "Groups operations so they all succeed or all fail together using BEGIN TRANSACTION / COMMIT / ROLLBACK.",
                "use_case": "Ensuring data consistency within a single database",
                "limitation": "Doesn't prevent concurrent transactions from reading same data",
            },
            "pessimistic_locking": {
                "name": "Pessimistic Locking",
                "description": "Acquires locks upfront using SELECT ... FOR UPDATE to block other transactions.",
                "use_case": "High contention scenarios",
                "latency": "Low",
                "complexity": "Low",
            },
            "isolation_levels": {
                "name": "Isolation Levels",
                "description": "Let the database handle conflicts by raising isolation level. SERIALIZABLE is strongest.",
                "use_case": "Need automatic conflict detection",
                "latency": "Medium",
                "complexity": "Low",
            },
            "occ": {
                "name": "Optimistic Concurrency Control",
                "description": "Assumes conflicts are rare, detects them via version numbers after they occur.",
                "use_case": "Low contention, high throughput scenarios",
                "latency": "Low (no conflicts)",
                "complexity": "Medium",
            },
        },
        "multi_node": {
            "two_phase_commit": {
                "name": "Two-Phase Commit (2PC)",
                "description": "Coordinator asks participants to prepare, then commit or abort based on responses.",
                "use_case": "Must have cross-system atomicity",
                "latency": "High",
                "complexity": "Very High",
                "tradeoff": "Expensive and fragile - coordinator crashes can leave participants in limbo",
            },
            "distributed_locks": {
                "name": "Distributed Locks",
                "description": "Ensures only one process can work on a resource across the entire system.",
                "implementations": ["Redis with TTL", "Database columns with cleanup jobs", "ZooKeeper/etcd"],
                "use_case": "User-facing flows, reservations",
                "latency": "Low",
                "complexity": "Medium",
            },
            "saga": {
                "name": "Saga Pattern",
                "description": "Breaks operations into independent steps with compensating transactions for rollback.",
                "use_case": "Long-running distributed transactions",
                "tradeoff": "Eventual consistency - system is temporarily inconsistent",
            },
        },
    }
