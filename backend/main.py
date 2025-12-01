from datetime import datetime
import random
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

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
