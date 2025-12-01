import asyncio
import random
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/realtime", tags=["realtime"])


@router.get("/sse")
async def sse():
    """Server-Sent Events - streams timestamps every second for 10 seconds."""

    async def event_generator():
        for i in range(10):
            timestamp = datetime.now().isoformat()
            yield f"data: {{\"count\": {i + 1}, \"timestamp\": \"{timestamp}\"}}\n\n"
            await asyncio.sleep(1)
        yield "data: {\"done\": true}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket - echoes messages back with timestamp, sends periodic pings."""
    await websocket.accept()

    async def send_pings():
        try:
            while True:
                await asyncio.sleep(3)
                await websocket.send_json({
                    "type": "ping",
                    "timestamp": datetime.now().isoformat()
                })
        except Exception:
            pass

    ping_task = asyncio.create_task(send_pings())

    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_json({
                "type": "echo",
                "message": data,
                "timestamp": datetime.now().isoformat()
            })
    except WebSocketDisconnect:
        ping_task.cancel()


@router.get("/poll")
async def poll():
    """Polling - returns current timestamp and random data."""
    return {
        "timestamp": datetime.now().isoformat(),
        "value": random.randint(1, 100),
    }


@router.get("/long-poll")
async def long_poll():
    """Long Polling - holds connection until event occurs (simulated) or timeout."""
    # Simulate waiting for an event (random delay 1-8 seconds)
    delay = random.uniform(1, 8)
    await asyncio.sleep(delay)

    return {
        "event": "update",
        "timestamp": datetime.now().isoformat(),
        "waited_seconds": round(delay, 2),
    }
