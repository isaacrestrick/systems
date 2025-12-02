from datetime import datetime
import random
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.realtime import router as realtime_router
from routers.contention import router as contention_router

app = FastAPI()
app.include_router(realtime_router)
app.include_router(contention_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    if random.random() < 0.5:
        raise Exception("Random error")
    return {"status": "ok", "timestamp": datetime.now().isoformat()}
