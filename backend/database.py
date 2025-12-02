import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).parent / "contention.db"

# In-memory distributed locks simulation
distributed_locks: dict[str, dict] = {}
lock_mutex = threading.Lock()

def init_db():
    """Initialize the database with tables for demos."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Table for pessimistic locking demo - bank account
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            balance INTEGER NOT NULL DEFAULT 1000,
            locked_by TEXT,
            locked_at REAL
        )
    """)

    # Table for optimistic concurrency control demo - inventory
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY,
            product TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 100,
            version INTEGER NOT NULL DEFAULT 1
        )
    """)

    # Table for transaction log
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transaction_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            demo_type TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            success INTEGER NOT NULL,
            timestamp REAL NOT NULL
        )
    """)

    # Insert default data if empty
    cursor.execute("SELECT COUNT(*) FROM accounts")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO accounts (id, name, balance) VALUES (1, 'Shared Account', 1000)")

    cursor.execute("SELECT COUNT(*) FROM inventory")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO inventory (id, product, quantity, version) VALUES (1, 'Widget', 100, 1)")

    conn.commit()
    conn.close()

@contextmanager
def get_connection():
    """Get a database connection with proper cleanup."""
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def reset_database():
    """Reset all tables to initial state."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE accounts SET balance = 1000, locked_by = NULL, locked_at = NULL WHERE id = 1")
        cursor.execute("UPDATE inventory SET quantity = 100, version = 1 WHERE id = 1")
        cursor.execute("DELETE FROM transaction_log")
        conn.commit()

    # Clear distributed locks
    with lock_mutex:
        distributed_locks.clear()

    return {"message": "Database reset to initial state"}

def log_transaction(demo_type: str, action: str, details: str, success: bool):
    """Log a transaction for display in the UI."""
    import time
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO transaction_log (demo_type, action, details, success, timestamp) VALUES (?, ?, ?, ?, ?)",
            (demo_type, action, details, int(success), time.time())
        )
        conn.commit()

def get_recent_logs(demo_type: str, limit: int = 20):
    """Get recent transaction logs for a demo type."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT action, details, success, timestamp FROM transaction_log WHERE demo_type = ? ORDER BY timestamp DESC LIMIT ?",
            (demo_type, limit)
        )
        rows = cursor.fetchall()
        return [
            {
                "action": row["action"],
                "details": row["details"],
                "success": bool(row["success"]),
                "timestamp": row["timestamp"]
            }
            for row in reversed(rows)
        ]

# Initialize database on module load
init_db()
