import asyncio
import time
import random
from collections import defaultdict
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/writes", tags=["writes"])

# ============ Shared State ============

# Stats tracking
stats = {
    "vertical": {"writes": 0, "avg_latency_ms": 0, "total_latency": 0},
    "sharding": {"writes": [0, 0, 0, 0], "total": 0},
    "queue": {"queued": 0, "processed": 0, "dropped": 0, "queue_depth": 0},
    "batching": {"individual_writes": 0, "batched_writes": 0, "db_operations": 0},
}

# ============ 1. Vertical Scaling Demo ============
# Simulates different database write performance characteristics

class WriteRequest(BaseModel):
    key: str
    value: str


class DatabaseType(BaseModel):
    db_type: str  # "traditional", "optimized", "append_only"


# Simulated databases with different write characteristics
databases = {
    "traditional": {"data": {}, "latency_base": 50, "name": "Traditional B-Tree DB"},
    "optimized": {"data": {}, "latency_base": 25, "name": "Optimized (Fewer Indexes)"},
    "append_only": {"data": {}, "latency_base": 5, "name": "Append-Only (Cassandra-like)"},
}


@router.post("/vertical/write")
async def vertical_write(req: WriteRequest, db_type: str = "traditional"):
    """Write to different database types with varying performance."""
    if db_type not in databases:
        return {"error": f"Unknown database type: {db_type}"}
    
    db = databases[db_type]
    
    # Simulate write latency based on database type
    # Traditional: slower due to B-tree updates and index maintenance
    # Optimized: fewer indexes = faster writes
    # Append-only: sequential writes are fastest
    latency = db["latency_base"] + random.uniform(-5, 10)
    await asyncio.sleep(latency / 1000)
    
    db["data"][req.key] = req.value
    stats["vertical"]["writes"] += 1
    stats["vertical"]["total_latency"] += latency
    stats["vertical"]["avg_latency_ms"] = stats["vertical"]["total_latency"] / stats["vertical"]["writes"]
    
    return {
        "status": "written",
        "db_type": db_type,
        "db_name": db["name"],
        "latency_ms": round(latency, 2),
        "stats": {
            "total_writes": stats["vertical"]["writes"],
            "avg_latency": round(stats["vertical"]["avg_latency_ms"], 2),
        }
    }


@router.post("/vertical/benchmark")
async def vertical_benchmark(count: int = 10):
    """Benchmark all database types with the same writes."""
    results = {}
    
    for db_type in databases:
        db = databases[db_type]
        start = time.time()
        latencies = []
        
        for i in range(count):
            latency = db["latency_base"] + random.uniform(-5, 10)
            latencies.append(latency)
            await asyncio.sleep(latency / 1000)
            db["data"][f"bench:{i}"] = f"value:{i}"
        
        total_time = (time.time() - start) * 1000
        results[db_type] = {
            "name": db["name"],
            "total_ms": round(total_time, 2),
            "avg_latency_ms": round(sum(latencies) / len(latencies), 2),
            "writes_per_sec": round(count / (total_time / 1000), 1),
        }
    
    return {"benchmark": results, "write_count": count}


# ============ 2. Sharding Demo ============
# Demonstrates partitioning writes across multiple shards

NUM_SHARDS = 4
shards = [{} for _ in range(NUM_SHARDS)]
shard_locks = [asyncio.Lock() for _ in range(NUM_SHARDS)]


def get_shard_id(key: str) -> int:
    """Hash-based shard selection (consistent hashing simplified)."""
    return hash(key) % NUM_SHARDS


def get_shard_id_bad(key: str) -> int:
    """Bad sharding - uses first character, causes hot spots."""
    # This will cluster common prefixes together
    return ord(key[0]) % NUM_SHARDS if key else 0


class ShardWriteRequest(BaseModel):
    key: str
    value: str
    use_bad_sharding: bool = False


@router.post("/sharding/write")
async def sharding_write(req: ShardWriteRequest):
    """Write to a shard based on key hash."""
    if req.use_bad_sharding:
        shard_id = get_shard_id_bad(req.key)
    else:
        shard_id = get_shard_id(req.key)
    
    async with shard_locks[shard_id]:
        await asyncio.sleep(0.02)  # Simulate write latency
        shards[shard_id][req.key] = req.value
        stats["sharding"]["writes"][shard_id] += 1
        stats["sharding"]["total"] += 1
    
    return {
        "status": "written",
        "shard_id": shard_id,
        "key": req.key,
        "sharding_strategy": "bad (prefix)" if req.use_bad_sharding else "good (hash)",
        "shard_distribution": stats["sharding"]["writes"].copy(),
        "total_writes": stats["sharding"]["total"],
    }


@router.post("/sharding/burst")
async def sharding_burst(count: int = 20, use_bad_sharding: bool = False, key_prefix: str = "user"):
    """Burst write to demonstrate shard distribution."""
    start = time.time()
    
    async def write_one(i: int):
        key = f"{key_prefix}:{i}"
        if use_bad_sharding:
            shard_id = get_shard_id_bad(key)
        else:
            shard_id = get_shard_id(key)
        
        async with shard_locks[shard_id]:
            await asyncio.sleep(0.02)
            shards[shard_id][key] = f"value:{i}"
            stats["sharding"]["writes"][shard_id] += 1
            stats["sharding"]["total"] += 1
        return shard_id
    
    shard_ids = await asyncio.gather(*[write_one(i) for i in range(count)])
    total_time = (time.time() - start) * 1000
    
    # Calculate distribution variance (lower is better)
    writes = stats["sharding"]["writes"]
    avg = sum(writes) / len(writes)
    variance = sum((w - avg) ** 2 for w in writes) / len(writes)
    
    return {
        "total_ms": round(total_time, 2),
        "writes_per_sec": round(count / (total_time / 1000), 1),
        "shard_distribution": writes.copy(),
        "variance": round(variance, 2),
        "strategy": "bad (prefix)" if use_bad_sharding else "good (hash)",
        "note": "Lower variance = better distribution" if variance < 10 else "High variance = uneven load!",
    }


# ============ 3. Queue and Load Shedding Demo ============
# Demonstrates buffering writes and dropping under load

write_queue: asyncio.Queue = asyncio.Queue(maxsize=50)
queue_processing = False
queue_processor_task = None


class QueuedWrite(BaseModel):
    key: str
    value: str
    priority: int = 1  # 1 = low, 2 = medium, 3 = high


@router.post("/queue/enqueue")
async def queue_enqueue(req: QueuedWrite):
    """Add a write to the queue."""
    try:
        write_queue.put_nowait({
            "key": req.key,
            "value": req.value,
            "priority": req.priority,
            "timestamp": time.time(),
        })
        stats["queue"]["queued"] += 1
        stats["queue"]["queue_depth"] = write_queue.qsize()
        
        return {
            "status": "queued",
            "position": write_queue.qsize(),
            "priority": req.priority,
            "stats": stats["queue"].copy(),
        }
    except asyncio.QueueFull:
        # Load shedding - drop low priority writes when queue is full
        if req.priority < 3:
            stats["queue"]["dropped"] += 1
            return {
                "status": "dropped",
                "reason": "queue_full",
                "priority": req.priority,
                "note": "Low priority write shed under load",
                "stats": stats["queue"].copy(),
            }
        else:
            # High priority - wait for space
            await write_queue.put({
                "key": req.key,
                "value": req.value,
                "priority": req.priority,
                "timestamp": time.time(),
            })
            stats["queue"]["queued"] += 1
            return {"status": "queued_blocking", "priority": req.priority}


@router.post("/queue/start-processor")
async def start_queue_processor():
    """Start the background queue processor."""
    global queue_processing, queue_processor_task
    
    if queue_processing:
        return {"status": "already_running"}
    
    queue_processing = True
    
    async def process_queue():
        global queue_processing
        while queue_processing:
            try:
                item = await asyncio.wait_for(write_queue.get(), timeout=0.5)
                await asyncio.sleep(0.05)  # Simulate DB write
                stats["queue"]["processed"] += 1
                stats["queue"]["queue_depth"] = write_queue.qsize()
            except asyncio.TimeoutError:
                continue
    
    queue_processor_task = asyncio.create_task(process_queue())
    return {"status": "started", "stats": stats["queue"].copy()}


@router.post("/queue/stop-processor")
async def stop_queue_processor():
    """Stop the background queue processor."""
    global queue_processing, queue_processor_task
    queue_processing = False
    if queue_processor_task:
        queue_processor_task.cancel()
        try:
            await queue_processor_task
        except asyncio.CancelledError:
            pass
    return {"status": "stopped", "stats": stats["queue"].copy()}


@router.post("/queue/burst")
async def queue_burst(count: int = 30, mixed_priority: bool = True):
    """Send a burst of writes to demonstrate queue behavior."""
    results = {"queued": 0, "dropped": 0}
    
    for i in range(count):
        priority = random.choice([1, 2, 3]) if mixed_priority else 1
        try:
            write_queue.put_nowait({
                "key": f"burst:{i}",
                "value": f"data:{i}",
                "priority": priority,
                "timestamp": time.time(),
            })
            stats["queue"]["queued"] += 1
            results["queued"] += 1
        except asyncio.QueueFull:
            if priority < 3:
                stats["queue"]["dropped"] += 1
                results["dropped"] += 1
            else:
                # High priority waits
                await write_queue.put({
                    "key": f"burst:{i}",
                    "value": f"data:{i}",
                    "priority": priority,
                    "timestamp": time.time(),
                })
                stats["queue"]["queued"] += 1
                results["queued"] += 1
    
    stats["queue"]["queue_depth"] = write_queue.qsize()
    
    return {
        "burst_results": results,
        "queue_depth": write_queue.qsize(),
        "stats": stats["queue"].copy(),
        "note": f"Dropped {results['dropped']} low-priority writes (load shedding)"
    }


# ============ 4. Batching Demo ============
# Demonstrates write batching and aggregation

pending_counts: dict[str, int] = defaultdict(int)
batch_buffer: list[dict] = []
BATCH_SIZE = 10
batching_database: dict[str, int] = {}


class IncrementRequest(BaseModel):
    key: str
    amount: int = 1


@router.post("/batching/increment-individual")
async def increment_individual(req: IncrementRequest):
    """Increment a counter with individual DB writes."""
    await asyncio.sleep(0.03)  # Simulate DB write
    
    if req.key not in batching_database:
        batching_database[req.key] = 0
    batching_database[req.key] += req.amount
    
    stats["batching"]["individual_writes"] += 1
    stats["batching"]["db_operations"] += 1
    
    return {
        "status": "written",
        "key": req.key,
        "new_value": batching_database[req.key],
        "mode": "individual",
        "db_operations": stats["batching"]["db_operations"],
    }


@router.post("/batching/increment-batched")
async def increment_batched(req: IncrementRequest):
    """Increment a counter using write batching."""
    pending_counts[req.key] += req.amount
    stats["batching"]["batched_writes"] += 1
    
    # Check if we should flush the batch
    total_pending = sum(pending_counts.values())
    
    return {
        "status": "batched",
        "key": req.key,
        "pending_amount": pending_counts[req.key],
        "total_pending": total_pending,
        "mode": "batched",
        "note": f"Will flush when batch reaches {BATCH_SIZE} or on manual flush",
    }


@router.post("/batching/flush")
async def flush_batch():
    """Flush pending batched writes to database."""
    global pending_counts
    
    if not pending_counts:
        return {"status": "nothing_to_flush"}
    
    # Single batch write for all pending counts
    await asyncio.sleep(0.03)  # Single DB operation for entire batch
    
    flushed = dict(pending_counts)
    for key, amount in flushed.items():
        if key not in batching_database:
            batching_database[key] = 0
        batching_database[key] += amount
    
    stats["batching"]["db_operations"] += 1
    pending_counts = defaultdict(int)
    
    return {
        "status": "flushed",
        "items_flushed": len(flushed),
        "total_increments": sum(flushed.values()),
        "db_operations": stats["batching"]["db_operations"],
        "note": f"Batched {sum(flushed.values())} increments into 1 DB operation",
    }


@router.post("/batching/compare")
async def batching_compare(count: int = 20):
    """Compare individual vs batched writes."""
    # Reset
    batching_database.clear()
    stats["batching"]["db_operations"] = 0
    
    # Individual writes
    start_individual = time.time()
    for i in range(count):
        await asyncio.sleep(0.03)
        key = f"counter:{i % 5}"
        if key not in batching_database:
            batching_database[key] = 0
        batching_database[key] += 1
    individual_time = (time.time() - start_individual) * 1000
    individual_ops = count
    
    # Reset for batched
    batching_database.clear()
    local_pending: dict[str, int] = defaultdict(int)
    
    # Batched writes
    start_batched = time.time()
    for i in range(count):
        key = f"counter:{i % 5}"
        local_pending[key] += 1
    
    # Single flush
    await asyncio.sleep(0.03)
    for key, amount in local_pending.items():
        batching_database[key] = amount
    batched_time = (time.time() - start_batched) * 1000
    batched_ops = 1
    
    return {
        "individual": {
            "total_ms": round(individual_time, 2),
            "db_operations": individual_ops,
            "writes_per_sec": round(count / (individual_time / 1000), 1),
        },
        "batched": {
            "total_ms": round(batched_time, 2),
            "db_operations": batched_ops,
            "writes_per_sec": round(count / (batched_time / 1000), 1),
        },
        "improvement": f"{round(individual_time / batched_time, 1)}x faster",
        "db_ops_saved": individual_ops - batched_ops,
    }


# ============ Hierarchical Aggregation Demo ============
# For high-volume counters like likes/views

aggregation_levels = {
    "leaf": defaultdict(int),      # Level 0: raw increments
    "aggregator": defaultdict(int), # Level 1: intermediate aggregation  
    "root": defaultdict(int),       # Level 2: final counts
}
aggregation_stats = {"leaf_writes": 0, "aggregator_flushes": 0, "root_writes": 0}


@router.post("/aggregation/increment")
async def hierarchical_increment(key: str, amount: int = 1):
    """Increment using hierarchical aggregation."""
    # Write to leaf level (in-memory, very fast)
    aggregation_levels["leaf"][key] += amount
    aggregation_stats["leaf_writes"] += 1
    
    # Auto-flush to aggregator when leaf gets large
    if aggregation_levels["leaf"][key] >= 10:
        aggregation_levels["aggregator"][key] += aggregation_levels["leaf"][key]
        aggregation_levels["leaf"][key] = 0
        aggregation_stats["aggregator_flushes"] += 1
    
    return {
        "status": "incremented",
        "key": key,
        "leaf_value": aggregation_levels["leaf"][key],
        "aggregator_value": aggregation_levels["aggregator"][key],
        "total": aggregation_levels["leaf"][key] + aggregation_levels["aggregator"][key] + aggregation_levels["root"][key],
        "stats": aggregation_stats.copy(),
    }


@router.post("/aggregation/flush-to-root")
async def flush_to_root():
    """Flush aggregator level to root (simulates DB write)."""
    await asyncio.sleep(0.05)  # Simulate DB write
    
    flushed = 0
    for key, value in aggregation_levels["aggregator"].items():
        if value > 0:
            aggregation_levels["root"][key] += value
            flushed += value
    
    aggregation_levels["aggregator"].clear()
    aggregation_stats["root_writes"] += 1
    
    return {
        "status": "flushed",
        "total_flushed": flushed,
        "root_values": dict(aggregation_levels["root"]),
        "stats": aggregation_stats.copy(),
    }


@router.post("/aggregation/burst")
async def aggregation_burst(key: str = "likes", count: int = 100):
    """Burst increments to demonstrate hierarchical aggregation."""
    for _ in range(count):
        aggregation_levels["leaf"][key] += 1
        aggregation_stats["leaf_writes"] += 1
        
        if aggregation_levels["leaf"][key] >= 10:
            aggregation_levels["aggregator"][key] += aggregation_levels["leaf"][key]
            aggregation_levels["leaf"][key] = 0
            aggregation_stats["aggregator_flushes"] += 1
    
    return {
        "burst_count": count,
        "leaf_value": aggregation_levels["leaf"][key],
        "aggregator_value": aggregation_levels["aggregator"][key],
        "root_value": aggregation_levels["root"][key],
        "total": aggregation_levels["leaf"][key] + aggregation_levels["aggregator"][key] + aggregation_levels["root"][key],
        "stats": aggregation_stats.copy(),
        "note": f"{count} increments → {aggregation_stats['aggregator_flushes']} aggregator flushes (10x reduction)",
    }


# ============ Stats & Reset ============


@router.get("/stats")
async def get_stats():
    """Get current stats for all demos."""
    return {
        "vertical": stats["vertical"].copy(),
        "sharding": stats["sharding"].copy(),
        "queue": stats["queue"].copy(),
        "batching": stats["batching"].copy(),
        "aggregation": aggregation_stats.copy(),
    }


@router.post("/reset")
async def reset_all():
    """Reset all state."""
    global pending_counts, queue_processing
    
    # Stop queue processor
    queue_processing = False
    
    # Clear all data
    for db in databases.values():
        db["data"].clear()
    
    for shard in shards:
        shard.clear()
    
    while not write_queue.empty():
        try:
            write_queue.get_nowait()
        except asyncio.QueueEmpty:
            break
    
    batching_database.clear()
    pending_counts = defaultdict(int)
    
    for level in aggregation_levels.values():
        level.clear()
    
    # Reset stats
    stats["vertical"] = {"writes": 0, "avg_latency_ms": 0, "total_latency": 0}
    stats["sharding"] = {"writes": [0, 0, 0, 0], "total": 0}
    stats["queue"] = {"queued": 0, "processed": 0, "dropped": 0, "queue_depth": 0}
    stats["batching"] = {"individual_writes": 0, "batched_writes": 0, "db_operations": 0}
    aggregation_stats["leaf_writes"] = 0
    aggregation_stats["aggregator_flushes"] = 0
    aggregation_stats["root_writes"] = 0
    
    return {"status": "reset"}

