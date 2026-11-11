from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, SQLModel, select

from db import engine, get_session
from models import Task, TaskCreate
from scheduler import generate_schedule

# Fungsi yang dijalankan saat server menyala (membuat tabel database)
@asynccontextmanager
async def lifespan(app: FastAPI):
    SQLModel.metadata.create_all(engine)
    yield

app = FastAPI(title="ZenoSphere API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health():
    return {"status": "ok", "message": "ZenoSphere backend is running!"}

# ENDPOINT BARU: Tambah tugas
@app.post("/api/tasks", response_model=Task)
def create_task(task: TaskCreate, session: Session = Depends(get_session)):
    db_task = Task.model_validate(task)
    session.add(db_task)
    session.commit()
    session.refresh(db_task)
    return db_task

# ENDPOINT BARU: Lihat semua tugas
@app.get("/api/tasks", response_model=list[Task])
def read_tasks(session: Session = Depends(get_session)):
    tasks = session.exec(select(Task)).all()
    return tasks


# ENDPOINT BARU: Dapatkan jadwal hari ini
@app.get("/api/schedule")
def get_today_schedule(session: Session = Depends(get_session)):
    # Ambil semua tugas dari DB
    tasks = session.exec(select(Task)).all()

    # Generate jadwal
    schedule = generate_schedule(tasks)

    return {
        "date": "Hari Ini",
        "schedule_blocks": schedule
    }