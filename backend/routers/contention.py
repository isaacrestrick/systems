from fastapi import APIRouter

router = APIRouter(prefix="/api/contention", tags=["contention"])


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
