from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import admin, auth, catches, comments, identify, leaderboard, push, species, spots, users

app = FastAPI(title="Fish Pokedex API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

app.include_router(auth.router)
app.include_router(species.router)
app.include_router(catches.router)
app.include_router(identify.router)
app.include_router(leaderboard.router)
app.include_router(comments.router)
app.include_router(users.router)
app.include_router(admin.router)
app.include_router(spots.router)
app.include_router(push.router)


@app.get("/health")
def health():
    return {"status": "ok"}
