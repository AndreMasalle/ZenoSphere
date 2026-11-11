from typing import Optional
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field

# Model dasar untuk tugas (dipakai untuk validasi input)
class TaskBase(SQLModel):
    title: str
    description: Optional[str] = None
    type: str = "general"        # contoh: akademik, olahraga, belajar, santai
    deadline: Optional[datetime] = None
    estimated_min: int = 60      # estimasi durasi dalam menit
    importance: int = 3          # prioritas 1-5
    status: str = "todo"         # todo, done, moved

# Model tabel yang disimpan di database
class Task(TaskBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    # PERUBAHAN DI SINI: pakai datetime.now(timezone.utc)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Model khusus untuk input dari user (tanpa id dan created_at)
class TaskCreate(TaskBase):
    pass