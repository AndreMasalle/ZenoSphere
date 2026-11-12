from typing import Optional
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field


class TaskBase(SQLModel):
    title: str
    description: Optional[str] = None
    item_type: str = "task"  # event, task, appointment
    type: str = "general"  # kategori AI

    start_time: datetime  # Waktu mulai / waktu pengerjaan
    task_deadline: Optional[datetime] = None  # Khusus Task: Batas waktu
    notify_minutes: Optional[int] = 30  # Khusus Appointment: Notifikasi (menit)

    estimated_min: int = 60
    importance: int = 3
    status: str = "todo"
    reason: Optional[str] = None
    warning: Optional[str] = None

    # Kolom AI
    action: Optional[str] = "keep"
    preferred_period: Optional[str] = "any"
    max_session_min: Optional[int] = 90
    break_min: Optional[int] = 15

    # Kolom Baru: Tugas Berulang
    is_recurring: bool = False
    recurrence_type: Optional[str] = None  # "daily", "weekly"


class Task(TaskBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TaskCreate(TaskBase):
    pass


class UserRule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    rule_text: str = Field(default="Prioritaskan akademik, olahraga, dan belajar. Tetap jaga work-life balance.")