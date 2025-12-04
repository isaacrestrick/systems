import asyncio
import time
import uuid
import random
from collections import deque
from enum import Enum
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

# ============ Shared State ============

class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    DEAD = "dead"  # Moved to DLQ


# Job storage
jobs: dict[str, dict] = {}
# Main job queue (simulated)
job_queue: deque = deque()
# Dead letter queue
dead_letter_queue: deque = deque()
# Worker state
workers: dict[str, dict] = {}
# Processing stats
stats = {
    "jobs_submitted": 0,
    "jobs_completed": 0,
    "jobs_failed": 0,
    "jobs_in_dlq": 0,
    "total_processing_time": 0,
    "queue_rejections": 0,
}

# Config
MAX_QUEUE_SIZE = 10
MAX_RETRIES = 3
WORKER_COUNT = 3

# Background worker task
worker_task = None
workers_running = False


# ============ 1. Sync vs Async Demo ============

class SyncJobRequest(BaseModel):
    duration_seconds: float = 3.0


@router.post("/sync/process")
async def sync_process(req: SyncJobRequest):
    """Synchronous processing - blocks until complete."""
    start = time.time()
    
    # Simulate heavy work (blocking)
    await asyncio.sleep(req.duration_seconds)
    
    elapsed = time.time() - start
    return {
        "status": "completed",
        "processing_time_ms": round(elapsed * 1000, 2),
        "message": f"Processed synchronously in {elapsed:.2f}s",
        "note": "User had to wait the entire time!",
    }


@router.post("/async/submit")
async def async_submit(req: SyncJobRequest):
    """Async processing - returns immediately with job ID."""
    job_id = str(uuid.uuid4())[:8]
    
    jobs[job_id] = {
        "id": job_id,
        "status": JobStatus.PENDING,
        "duration": req.duration_seconds,
        "created_at": time.time(),
        "started_at": None,
        "completed_at": None,
        "result": None,
        "retries": 0,
    }
    
    job_queue.append(job_id)
    stats["jobs_submitted"] += 1
    
    return {
        "status": "accepted",
        "job_id": job_id,
        "queue_position": len(job_queue),
        "message": "Job queued for processing",
        "note": "User gets immediate response!",
    }


@router.get("/async/status/{job_id}")
async def async_status(job_id: str):
    """Check status of an async job."""
    if job_id not in jobs:
        return {"error": "Job not found"}
    
    job = jobs[job_id]
    response = {
        "job_id": job_id,
        "status": job["status"],
        "created_at": job["created_at"],
    }
    
    if job["started_at"]:
        response["started_at"] = job["started_at"]
        response["wait_time_ms"] = round((job["started_at"] - job["created_at"]) * 1000, 2)
    
    if job["completed_at"]:
        response["completed_at"] = job["completed_at"]
        response["processing_time_ms"] = round((job["completed_at"] - job["started_at"]) * 1000, 2)
        response["result"] = job["result"]
    
    return response


# ============ 2. Worker Pool Demo ============

@router.post("/workers/start")
async def start_workers():
    """Start the worker pool."""
    global workers_running, worker_task
    
    if workers_running:
        return {"status": "already_running", "worker_count": WORKER_COUNT}
    
    workers_running = True
    
    # Initialize workers
    for i in range(WORKER_COUNT):
        worker_id = f"worker-{i}"
        workers[worker_id] = {
            "id": worker_id,
            "status": "idle",
            "jobs_processed": 0,
            "current_job": None,
        }
    
    # Start background processing
    worker_task = asyncio.create_task(run_workers())
    
    return {
        "status": "started",
        "worker_count": WORKER_COUNT,
        "workers": list(workers.keys()),
    }


@router.post("/workers/stop")
async def stop_workers():
    """Stop the worker pool."""
    global workers_running, worker_task
    
    workers_running = False
    if worker_task:
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass
    
    # Mark all workers as stopped
    for w in workers.values():
        w["status"] = "stopped"
    
    return {"status": "stopped"}


async def run_workers():
    """Background task that processes jobs."""
    global workers_running
    
    while workers_running:
        # Find idle workers and assign jobs
        for worker_id, worker in workers.items():
            if worker["status"] == "idle" and job_queue:
                job_id = job_queue.popleft()
                if job_id in jobs:
                    job = jobs[job_id]
                    if job["status"] == JobStatus.PENDING:
                        # Assign job to worker
                        worker["status"] = "processing"
                        worker["current_job"] = job_id
                        job["status"] = JobStatus.PROCESSING
                        job["started_at"] = time.time()
                        job["worker"] = worker_id
                        
                        # Process in background
                        asyncio.create_task(process_job(worker_id, job_id))
        
        await asyncio.sleep(0.1)


async def process_job(worker_id: str, job_id: str):
    """Process a single job."""
    if job_id not in jobs or worker_id not in workers:
        return
    
    job = jobs[job_id]
    worker = workers[worker_id]
    
    try:
        # Simulate processing
        await asyncio.sleep(job["duration"])
        
        # Random failure for demo (20% chance)
        if job.get("force_fail") or (random.random() < 0.2 and job["retries"] < MAX_RETRIES):
            raise Exception("Random processing error")
        
        # Success
        job["status"] = JobStatus.COMPLETED
        job["completed_at"] = time.time()
        job["result"] = f"Processed by {worker_id}"
        stats["jobs_completed"] += 1
        stats["total_processing_time"] += job["duration"]
        
    except Exception as e:
        job["retries"] += 1
        
        if job["retries"] >= MAX_RETRIES:
            # Move to DLQ
            job["status"] = JobStatus.DEAD
            job["error"] = str(e)
            dead_letter_queue.append(job_id)
            stats["jobs_in_dlq"] += 1
        else:
            # Retry - put back in queue
            job["status"] = JobStatus.PENDING
            job["started_at"] = None
            job_queue.append(job_id)
            stats["jobs_failed"] += 1
    
    finally:
        worker["status"] = "idle"
        worker["current_job"] = None
        worker["jobs_processed"] += 1


@router.get("/workers/status")
async def workers_status():
    """Get status of all workers."""
    return {
        "running": workers_running,
        "workers": list(workers.values()),
        "queue_depth": len(job_queue),
        "dlq_depth": len(dead_letter_queue),
        "stats": stats.copy(),
    }


# ============ 3. Job Queue Demo ============

class JobRequest(BaseModel):
    name: str = "task"
    duration: float = 1.0
    force_fail: bool = False


@router.post("/queue/submit")
async def submit_job(req: JobRequest):
    """Submit a job to the queue."""
    # Check backpressure
    if len(job_queue) >= MAX_QUEUE_SIZE:
        stats["queue_rejections"] += 1
        return {
            "status": "rejected",
            "reason": "queue_full",
            "queue_depth": len(job_queue),
            "max_queue_size": MAX_QUEUE_SIZE,
            "message": "System busy - try again later",
        }
    
    job_id = str(uuid.uuid4())[:8]
    
    jobs[job_id] = {
        "id": job_id,
        "name": req.name,
        "status": JobStatus.PENDING,
        "duration": req.duration,
        "force_fail": req.force_fail,
        "created_at": time.time(),
        "started_at": None,
        "completed_at": None,
        "result": None,
        "retries": 0,
        "error": None,
    }
    
    job_queue.append(job_id)
    stats["jobs_submitted"] += 1
    
    return {
        "status": "queued",
        "job_id": job_id,
        "name": req.name,
        "queue_position": len(job_queue),
    }


@router.post("/queue/burst")
async def submit_burst(count: int = 15):
    """Submit a burst of jobs to demonstrate backpressure."""
    results = {"queued": 0, "rejected": 0, "job_ids": []}
    
    for i in range(count):
        if len(job_queue) >= MAX_QUEUE_SIZE:
            stats["queue_rejections"] += 1
            results["rejected"] += 1
            continue
        
        job_id = str(uuid.uuid4())[:8]
        jobs[job_id] = {
            "id": job_id,
            "name": f"burst-job-{i}",
            "status": JobStatus.PENDING,
            "duration": random.uniform(0.5, 2.0),
            "force_fail": False,
            "created_at": time.time(),
            "started_at": None,
            "completed_at": None,
            "result": None,
            "retries": 0,
            "error": None,
        }
        
        job_queue.append(job_id)
        stats["jobs_submitted"] += 1
        results["queued"] += 1
        results["job_ids"].append(job_id)
    
    return {
        **results,
        "queue_depth": len(job_queue),
        "max_queue_size": MAX_QUEUE_SIZE,
        "message": f"Queued {results['queued']}, rejected {results['rejected']} (backpressure)",
    }


@router.get("/queue/status")
async def queue_status():
    """Get queue status."""
    pending_jobs = [j for j in jobs.values() if j["status"] == JobStatus.PENDING]
    processing_jobs = [j for j in jobs.values() if j["status"] == JobStatus.PROCESSING]
    completed_jobs = [j for j in jobs.values() if j["status"] == JobStatus.COMPLETED]
    failed_jobs = [j for j in jobs.values() if j["status"] == JobStatus.DEAD]
    
    return {
        "queue_depth": len(job_queue),
        "max_queue_size": MAX_QUEUE_SIZE,
        "pending": len(pending_jobs),
        "processing": len(processing_jobs),
        "completed": len(completed_jobs),
        "in_dlq": len(failed_jobs),
        "stats": stats.copy(),
    }


# ============ 4. Dead Letter Queue Demo ============

@router.post("/dlq/submit-failing")
async def submit_failing_job():
    """Submit a job that will always fail (for DLQ demo)."""
    job_id = str(uuid.uuid4())[:8]
    
    jobs[job_id] = {
        "id": job_id,
        "name": "failing-job",
        "status": JobStatus.PENDING,
        "duration": 0.5,
        "force_fail": True,
        "created_at": time.time(),
        "started_at": None,
        "completed_at": None,
        "result": None,
        "retries": 0,
        "error": None,
    }
    
    job_queue.append(job_id)
    stats["jobs_submitted"] += 1
    
    return {
        "status": "queued",
        "job_id": job_id,
        "message": f"Job will fail and retry {MAX_RETRIES} times before going to DLQ",
        "max_retries": MAX_RETRIES,
    }


@router.get("/dlq/list")
async def list_dlq():
    """List jobs in the dead letter queue."""
    dlq_jobs = [jobs[jid] for jid in dead_letter_queue if jid in jobs]
    
    return {
        "count": len(dlq_jobs),
        "jobs": dlq_jobs,
        "message": "These jobs failed repeatedly and need investigation",
    }


@router.post("/dlq/retry/{job_id}")
async def retry_dlq_job(job_id: str):
    """Retry a job from the DLQ."""
    if job_id not in jobs:
        return {"error": "Job not found"}
    
    job = jobs[job_id]
    if job["status"] != JobStatus.DEAD:
        return {"error": "Job is not in DLQ"}
    
    # Reset job for retry
    job["status"] = JobStatus.PENDING
    job["retries"] = 0
    job["force_fail"] = False  # Give it a chance this time
    job["error"] = None
    
    # Remove from DLQ and add to main queue
    if job_id in dead_letter_queue:
        dead_letter_queue.remove(job_id)
        stats["jobs_in_dlq"] -= 1
    
    job_queue.append(job_id)
    
    return {
        "status": "requeued",
        "job_id": job_id,
        "message": "Job moved from DLQ back to main queue",
    }


@router.post("/dlq/clear")
async def clear_dlq():
    """Clear the dead letter queue."""
    count = len(dead_letter_queue)
    dead_letter_queue.clear()
    stats["jobs_in_dlq"] = 0
    
    return {"status": "cleared", "jobs_removed": count}


# ============ Stats & Reset ============

@router.get("/stats")
async def get_stats():
    """Get overall stats."""
    return {
        "stats": stats.copy(),
        "queue_depth": len(job_queue),
        "dlq_depth": len(dead_letter_queue),
        "total_jobs": len(jobs),
        "workers_running": workers_running,
        "worker_count": len(workers),
    }


@router.post("/reset")
async def reset_all():
    """Reset all state."""
    global workers_running, worker_task
    
    # Stop workers
    workers_running = False
    if worker_task:
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass
    
    # Clear all state
    jobs.clear()
    job_queue.clear()
    dead_letter_queue.clear()
    workers.clear()
    
    # Reset stats
    stats["jobs_submitted"] = 0
    stats["jobs_completed"] = 0
    stats["jobs_failed"] = 0
    stats["jobs_in_dlq"] = 0
    stats["total_processing_time"] = 0
    stats["queue_rejections"] = 0
    
    return {"status": "reset"}

