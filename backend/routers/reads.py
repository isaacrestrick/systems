import asyncio
import time
import random
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/reads", tags=["reads"])

# Simulated database with artificial delay
database: dict[str, dict] = {}
# Simulated cache
cache: dict[str, dict] = {}
# Read replicas (simulated)
replicas: list[dict[str, dict]] = [{}, {}, {}]
# Request stats
stats = {"db_reads": 0, "cache_hits": 0, "cache_misses": 0, "replica_reads": [0, 0, 0]}
# Cache versions for versioned invalidation
cache_versions: dict[str, int] = {}


def reset_stats():
    stats["db_reads"] = 0
    stats["cache_hits"] = 0
    stats["cache_misses"] = 0
    stats["replica_reads"] = [0, 0, 0]


# ============ Database Simulation ============


def init_sample_data():
    """Initialize sample data in the database."""
    for i in range(100):
        key = f"product:{i}"
        database[key] = {
            "id": i,
            "name": f"Product {i}",
            "price": round(random.uniform(10, 500), 2),
            "views": random.randint(100, 10000),
            "version": 1,
        }
        cache_versions[key] = 1
    # Sync to replicas (with lag simulation)
    for replica in replicas:
        replica.update(database)


init_sample_data()


# ============ No Caching Demo ============


class ReadRequest(BaseModel):
    key: str


@router.post("/no-cache/read")
async def read_no_cache(req: ReadRequest):
    """Read directly from database (slow)."""
    await asyncio.sleep(0.05)  # Simulate DB latency (50ms)
    stats["db_reads"] += 1

    if req.key in database:
        return {
            "data": database[req.key],
            "latency_ms": 50,
            "source": "database",
            "stats": stats.copy(),
        }
    return {"error": "Not found", "latency_ms": 50, "source": "database"}


# ============ Simple Caching Demo ============


@router.post("/cache/read")
async def read_with_cache(req: ReadRequest):
    """Read with cache-aside pattern."""
    start = time.time()

    # Check cache first
    if req.key in cache:
        stats["cache_hits"] += 1
        latency = (time.time() - start) * 1000 + 2  # ~2ms cache latency
        return {
            "data": cache[req.key],
            "latency_ms": round(latency, 2),
            "source": "cache",
            "stats": stats.copy(),
        }

    # Cache miss - read from DB
    stats["cache_misses"] += 1
    await asyncio.sleep(0.05)  # Simulate DB latency
    stats["db_reads"] += 1

    if req.key in database:
        # Populate cache
        cache[req.key] = database[req.key].copy()
        latency = (time.time() - start) * 1000
        return {
            "data": database[req.key],
            "latency_ms": round(latency, 2),
            "source": "database (cache miss)",
            "stats": stats.copy(),
        }
    return {"error": "Not found"}


@router.post("/cache/invalidate")
async def invalidate_cache(req: ReadRequest):
    """Invalidate a cache entry."""
    if req.key in cache:
        del cache[req.key]
        return {"status": "invalidated", "key": req.key}
    return {"status": "not_in_cache", "key": req.key}


@router.post("/cache/clear")
async def clear_cache():
    """Clear all cache entries."""
    cache.clear()
    return {"status": "cleared"}


# ============ Read Replicas Demo ============


@router.post("/replica/read")
async def read_from_replica(req: ReadRequest):
    """Read from a random read replica."""
    # Pick a random replica
    replica_idx = random.randint(0, len(replicas) - 1)
    replica = replicas[replica_idx]
    stats["replica_reads"][replica_idx] += 1

    await asyncio.sleep(0.03)  # Slightly faster than primary (30ms)

    if req.key in replica:
        return {
            "data": replica[req.key],
            "latency_ms": 30,
            "source": f"replica-{replica_idx}",
            "stats": stats.copy(),
        }
    return {"error": "Not found", "source": f"replica-{replica_idx}"}


@router.post("/replica/write")
async def write_to_primary(req: ReadRequest, value: dict):
    """Write to primary and replicate."""
    # Write to primary
    await asyncio.sleep(0.05)  # Primary write latency
    database[req.key] = value

    # Async replication to replicas (with lag)
    async def replicate(replica_idx: int, delay: float):
        await asyncio.sleep(delay)
        replicas[replica_idx][req.key] = value.copy()

    # Replicas get data at different times (replication lag)
    asyncio.create_task(replicate(0, 0.1))  # 100ms lag
    asyncio.create_task(replicate(1, 0.2))  # 200ms lag
    asyncio.create_task(replicate(2, 0.3))  # 300ms lag

    return {
        "status": "written",
        "replication": "async",
        "note": "Replicas will be updated with 100-300ms lag",
    }


# ============ Cache Stampede Demo ============

stampede_cache: dict[str, dict] = {}
stampede_locks: dict[str, asyncio.Lock] = {}
stampede_stats = {"concurrent_rebuilds": 0, "max_concurrent": 0, "total_rebuilds": 0}


@router.post("/stampede/expire")
async def expire_stampede_cache():
    """Expire the cache to trigger a stampede."""
    stampede_cache.clear()
    stampede_stats["concurrent_rebuilds"] = 0
    stampede_stats["max_concurrent"] = 0
    stampede_stats["total_rebuilds"] = 0
    return {"status": "cache_expired", "stats": stampede_stats.copy()}


@router.post("/stampede/read-naive")
async def read_stampede_naive(req: ReadRequest):
    """Read without stampede protection - all misses hit DB."""
    if req.key in stampede_cache:
        return {"data": stampede_cache[req.key], "source": "cache", "rebuilt": False}

    # Cache miss - everyone hits the database
    stampede_stats["concurrent_rebuilds"] += 1
    stampede_stats["max_concurrent"] = max(
        stampede_stats["max_concurrent"], stampede_stats["concurrent_rebuilds"]
    )
    stampede_stats["total_rebuilds"] += 1

    await asyncio.sleep(0.2)  # Expensive rebuild (200ms)

    stampede_stats["concurrent_rebuilds"] -= 1

    if req.key in database:
        stampede_cache[req.key] = database[req.key].copy()
        return {
            "data": database[req.key],
            "source": "database",
            "rebuilt": True,
            "stats": stampede_stats.copy(),
        }
    return {"error": "Not found"}


@router.post("/stampede/read-protected")
async def read_stampede_protected(req: ReadRequest):
    """Read with lock-based stampede protection."""
    if req.key in stampede_cache:
        return {"data": stampede_cache[req.key], "source": "cache", "rebuilt": False}

    # Get or create lock for this key
    if req.key not in stampede_locks:
        stampede_locks[req.key] = asyncio.Lock()

    async with stampede_locks[req.key]:
        # Double-check after acquiring lock
        if req.key in stampede_cache:
            return {
                "data": stampede_cache[req.key],
                "source": "cache (after lock)",
                "rebuilt": False,
            }

        # Only one request rebuilds
        stampede_stats["total_rebuilds"] += 1
        await asyncio.sleep(0.2)  # Expensive rebuild

        if req.key in database:
            stampede_cache[req.key] = database[req.key].copy()
            return {
                "data": database[req.key],
                "source": "database",
                "rebuilt": True,
                "stats": stampede_stats.copy(),
            }
    return {"error": "Not found"}


# ============ Cache Versioning Demo ============

versioned_cache: dict[str, dict] = {}


class UpdateRequest(BaseModel):
    key: str
    price: float


@router.post("/versioning/read")
async def read_versioned(req: ReadRequest):
    """Read using cache versioning."""
    if req.key not in cache_versions:
        return {"error": "Not found"}

    version = cache_versions[req.key]
    versioned_key = f"{req.key}:v{version}"

    # Check versioned cache
    if versioned_key in versioned_cache:
        return {
            "data": versioned_cache[versioned_key],
            "source": "cache",
            "version": version,
            "cache_key": versioned_key,
        }

    # Cache miss
    await asyncio.sleep(0.05)
    if req.key in database:
        data = database[req.key].copy()
        versioned_cache[versioned_key] = data
        return {
            "data": data,
            "source": "database",
            "version": version,
            "cache_key": versioned_key,
        }
    return {"error": "Not found"}


@router.post("/versioning/update")
async def update_versioned(req: UpdateRequest):
    """Update with version increment - old cache becomes stale."""
    if req.key not in database:
        return {"error": "Not found"}

    # Update database
    database[req.key]["price"] = req.price
    database[req.key]["version"] += 1

    # Increment version (old cache entries become unreachable)
    old_version = cache_versions[req.key]
    cache_versions[req.key] += 1
    new_version = cache_versions[req.key]

    return {
        "status": "updated",
        "old_version": old_version,
        "new_version": new_version,
        "note": f"Old cache key {req.key}:v{old_version} is now stale, new key is {req.key}:v{new_version}",
    }


@router.get("/versioning/cache-state")
async def get_versioned_cache_state():
    """Get current state of versioned cache."""
    return {
        "cache_entries": list(versioned_cache.keys()),
        "versions": {k: v for k, v in list(cache_versions.items())[:10]},
    }


# ============ Stats & Reset ============


@router.get("/stats")
async def get_stats():
    """Get current stats."""
    return {
        "general": stats.copy(),
        "stampede": stampede_stats.copy(),
        "cache_size": len(cache),
        "versioned_cache_size": len(versioned_cache),
    }


@router.post("/reset")
async def reset_all():
    """Reset all state."""
    cache.clear()
    stampede_cache.clear()
    stampede_locks.clear()
    versioned_cache.clear()
    reset_stats()
    stampede_stats["concurrent_rebuilds"] = 0
    stampede_stats["max_concurrent"] = 0
    stampede_stats["total_rebuilds"] = 0
    init_sample_data()
    return {"status": "reset"}
