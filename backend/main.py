from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, SQLModel, select
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from zoneinfo import ZoneInfo

from db import engine, get_session
from models import Task, TaskCreate, UserRule
from scheduler import generate_schedule, find_empty_slots
from llm import analyze_task, choose_best_slot
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

    ai_suggestion = analyze_task(request.title, request.description, rule_text, new_start_str, existing_schedule_text)

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


class TaskUpdate(BaseModel):
    title: str
    description: str = ""
    item_type: str
    start_time: datetime
    task_deadline: datetime | None = None
    notify_minutes: int | None = 30
    estimated_min: int = 60


@app.put("/api/tasks/{task_id}", response_model=Task)
def update_task(task_id: int, req: TaskUpdate, session: Session = Depends(get_session)):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tugas tidak ditemukan")

    task.title = req.title
    task.description = req.description
    task.item_type = req.item_type
    task.start_time = req.start_time
    task.task_deadline = req.task_deadline
    task.notify_minutes = req.notify_minutes
    task.estimated_min = req.estimated_min

    local_tz = ZoneInfo("Asia/Jakarta")
    if task.start_time.tzinfo is None:
        task.start_time = task.start_time.replace(tzinfo=local_tz).astimezone(timezone.utc)
    if task.task_deadline and task.task_deadline.tzinfo is None:
        task.task_deadline = task.task_deadline.replace(tzinfo=local_tz).astimezone(timezone.utc)

    session.add(task)
    session.commit()
    session.refresh(task)
    return task


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

    try:
        delete_gcal_event(task_id)
    except Exception as e:
        print(f"Peringatan: Gagal hapus di GCal, tapi DB sudah bersih. Error: {e}")

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


@app.get("/api/matrix")
def get_eisenhower_matrix(session: Session = Depends(get_session)):
    tasks = session.exec(select(Task).where(Task.status == "todo")).all()
    now = datetime.now(timezone.utc)
    matrix_data = []
    for task in tasks:
        target_time = task.task_deadline if task.task_deadline else task.start_time
        is_urgent = False
        days_left = 999
        if target_time:
            if target_time.tzinfo is None: target_time = target_time.replace(tzinfo=timezone.utc)
            days_left = (target_time - now).total_seconds() / 86400
            if days_left <= 2: is_urgent = True
        is_important = task.importance >= 4
        quadrant = "Lakukan Segera (Q1)" if (is_important and is_urgent) else "Jadwalkan (Q2)" if (
                    is_important and not is_urgent) else "Delegasikan (Q3)" if (
                    not is_important and is_urgent) else "Abaikan (Q4)"
        matrix_data.append({
            "id": task.id, "title": task.title, "x_urgency": 1 if is_urgent else 2,
            "y_importance": task.importance, "quadrant": quadrant, "item_type": task.item_type,
            "days_left": round(days_left, 1), "duration": task.estimated_min
        })
    return {"matrix": matrix_data}


@app.post("/api/tasks/{task_id}/suggest-reschedule")
def suggest_reschedule(task_id: int, session: Session = Depends(get_session)):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tugas tidak ditemukan")

    user_rule = session.exec(select(UserRule)).first()
    rule_text = user_rule.rule_text if user_rule else ""

    all_tasks = session.exec(select(Task)).all()

    # 1. Cari 3 slot kosong (Logika Python)
    slots = find_empty_slots(all_tasks, task.estimated_min, count=3)
    if not slots:
        return {"status": "error", "message": "Tidak ditemukan slot kosong dalam 7 hari ke depan."}

    # 2. Minta LLM memilih slot terbaik (Penalaran LLM)
    ai_choice = choose_best_slot(task.title, task.estimated_min, slots, rule_text)

    chosen_idx = ai_choice.get("chosen_index", 1) - 1
    if chosen_idx < 0 or chosen_idx >= len(slots):
        chosen_idx = 0

    best_slot = slots[chosen_idx]

    return {
        "status": "success",
        "task_id": task.id,  # <-- PERBAIKAN: Kirim task_id asli ke frontend
        "original_task": task.title,
        "suggested_time": best_slot["label"],
        "suggested_time_iso": best_slot["start_time_iso"],
        "ai_reason": ai_choice.get("reason", "")
    }