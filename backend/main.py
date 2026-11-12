from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, SQLModel, select
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from zoneinfo import ZoneInfo

from db import engine, get_session
from models import Task, TaskCreate, UserRule
from scheduler import generate_schedule
from llm import analyze_task
from gcal import sync_schedule_to_gcal, delete_gcal_event


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


class RuleUpdate(BaseModel):
    rule_text: str


@app.get("/api/rules", response_model=UserRule)
def get_rules(session: Session = Depends(get_session)):
    rule = session.exec(select(UserRule)).first()
    if not rule:
        rule = UserRule()
        session.add(rule)
        session.commit()
        session.refresh(rule)
    return rule


@app.put("/api/rules", response_model=UserRule)
def update_rules(rule_data: RuleUpdate, session: Session = Depends(get_session)):
    rule = session.exec(select(UserRule)).first()
    if not rule:
        rule = UserRule()
        session.add(rule)
    rule.rule_text = rule_data.rule_text
    session.commit()
    session.refresh(rule)
    return rule


class TaskSmartAdd(BaseModel):
    title: str
    description: str = ""
    item_type: str = "task"
    start_time: datetime
    task_deadline: datetime | None = None
    notify_minutes: int | None = 30
    estimated_min: int = 60


@app.post("/api/tasks/smart-add", response_model=Task)
def smart_add_task(request: TaskSmartAdd, session: Session = Depends(get_session)):
    user_rule = session.exec(select(UserRule)).first()
    rule_text = user_rule.rule_text if user_rule else ""

    existing_tasks = session.exec(select(Task).where(Task.status == "todo")).all()
    existing_schedule_text = ""
    for t in existing_tasks:
        start_str = t.start_time.strftime("%Y-%m-%d %H:%M") if t.start_time else "Unknown"
        end_str = (t.start_time + timedelta(minutes=t.estimated_min)).strftime("%H:%M") if t.start_time else "Unknown"
        existing_schedule_text += f"- {t.title} (dari jam {start_str} sampai {end_str})\n"

    new_start_str = request.start_time.strftime("%Y-%m-%d %H:%M")

    ai_suggestion = analyze_task(
        request.title,
        request.description,
        rule_text,
        new_start_str,
        existing_schedule_text
    )

    db_task = Task(
        title=request.title,
        description=request.description,
        item_type=request.item_type,
        start_time=request.start_time,
        task_deadline=request.task_deadline,
        notify_minutes=request.notify_minutes,
        estimated_min=request.estimated_min,
        type=ai_suggestion.get("type", "general"),
        importance=ai_suggestion.get("importance", 3),
        reason=ai_suggestion.get("reason", ""),
        warning=ai_suggestion.get("warning", ""),
        action=ai_suggestion.get("action", "keep"),
        preferred_period=ai_suggestion.get("preferred_period", "any"),
        max_session_min=ai_suggestion.get("max_session_min", 90),
        break_min=ai_suggestion.get("break_min", 15),
        status="todo"
    )

    local_tz = ZoneInfo("Asia/Jakarta")
    if db_task.start_time and db_task.start_time.tzinfo is None:
        db_task.start_time = db_task.start_time.replace(tzinfo=local_tz).astimezone(timezone.utc)
    if db_task.task_deadline and db_task.task_deadline.tzinfo is None:
        db_task.task_deadline = db_task.task_deadline.replace(tzinfo=local_tz).astimezone(timezone.utc)

    session.add(db_task)
    session.commit()
    session.refresh(db_task)
    return db_task


@app.get("/api/tasks", response_model=list[Task])
def read_tasks(session: Session = Depends(get_session)):
    return session.exec(select(Task)).all()


@app.patch("/api/tasks/{task_id}/status", response_model=Task)
def toggle_task_status(task_id: int, session: Session = Depends(get_session)):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tugas tidak ditemukan")
    task.status = "done" if task.status == "todo" else "todo"
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


class RescheduleRequest(BaseModel):
    new_start_time: datetime


@app.patch("/api/tasks/{task_id}/reschedule", response_model=Task)
def reschedule_task(task_id: int, req: RescheduleRequest, session: Session = Depends(get_session)):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tugas tidak ditemukan")

    local_tz = ZoneInfo("Asia/Jakarta")
    new_time = req.new_start_time
    if new_time.tzinfo is None:
        new_time = new_time.replace(tzinfo=local_tz).astimezone(timezone.utc)

    task.start_time = new_time
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, session: Session = Depends(get_session)):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tugas tidak ditemukan")
    session.delete(task)
    session.commit()
    delete_gcal_event(task_id)
    return {"status": "success", "message": "Tugas berhasil dihapus"}


@app.get("/api/schedule")
def get_upcoming_schedule(session: Session = Depends(get_session)):
    tasks = session.exec(select(Task)).all()
    result = generate_schedule(tasks)
    return {"date": "Jadwal Mendatang", **result}


@app.post("/api/sync-gcal")
def sync_to_gcal(session: Session = Depends(get_session)):
    tasks = session.exec(select(Task).where(Task.status == "todo")).all()
    if not tasks:
        raise HTTPException(status_code=400, detail="Tidak ada tugas untuk disinkronkan.")

    total_created = 0
    total_updated = 0
    all_errors = []

    try:
        for task in tasks:
            if task.action == "block" or task.warning:
                continue

            local_tz = ZoneInfo("Asia/Jakarta")
            local_start = task.start_time.astimezone(local_tz) if task.start_time else datetime.now(local_tz)

            date_str = local_start.strftime("%Y-%m-%d")
            start_time = local_start.strftime("%H:%M")

            start_dt = datetime.strptime(f"{date_str} {start_time}", "%Y-%m-%d %H:%M")
            end_dt = start_dt + timedelta(minutes=task.estimated_min)
            end_date_str = end_dt.strftime("%Y-%m-%d")
            end_time = end_dt.strftime("%H:%M")

            prefix = "[TASK] " if task.item_type == "task" else "[EVENT] " if task.item_type == "event" else "[APPOINTMENT] "

            final_reason = task.reason if task.reason else f"Prioritas {task.importance}."
            if task.item_type == "task" and task.task_deadline:
                dl_local = task.task_deadline.astimezone(local_tz)
                final_reason += f"\n\nDeadline: {dl_local.strftime('%d %b %Y, %H:%M')}"

            block = {
                "task_id": task.id,
                "title": f"{prefix}{task.title}",
                "reason": final_reason,
                "start_time": start_time,
                "end_time": end_time,
                "end_date_str": end_date_str,
                "importance": task.importance,
                "item_type": task.item_type,
                "notify_minutes": task.notify_minutes
            }

            c, u, errs = sync_schedule_to_gcal([block], date_str)
            total_created += c
            total_updated += u
            all_errors.extend(errs)

        if all_errors:
            return {"status": "partial_success", "message": "Beberapa jadwal gagal disinkronkan.", "errors": all_errors}

        return {"status": "success", "message": f"Berhasil! {total_created} baru, {total_updated} diperbarui."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))