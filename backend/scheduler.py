from datetime import datetime, timedelta
from typing import List
from models import Task
from priority import calculate_priority_score


def generate_schedule(tasks: List[Task], start_hour: int = 8, end_hour: int = 22) -> List[dict]:
    """
    Membuat jadwal harian sederhana (greedy algorithm).
    Mulai dari jam 8 pagi sampai 10 malam.
    """
    # 1. Urutkan tugas berdasarkan skor prioritas tertinggi
    sorted_tasks = sorted(tasks, key=calculate_priority_score, reverse=True)

    schedule = []
    current_time = datetime.now().replace(hour=start_hour, minute=0, second=0, microsecond=0)
    end_of_day = datetime.now().replace(hour=end_hour, minute=0, second=0, microsecond=0)

    for task in sorted_tasks:
        if task.status == "done":
            continue  # Skip tugas yang sudah selesai

        # Hitung waktu selesai
        task_end_time = current_time + timedelta(minutes=task.estimated_min)

        # Jika tugas melebihi jam malam (misal lewat jam 22:00), berhenti.
        if task_end_time > end_of_day:
            break

        # Masukkan ke jadwal
        schedule.append({
            "task_id": task.id,
            "title": task.title,
            "type": task.type,
            "start_time": current_time.strftime("%H:%M"),
            "end_time": task_end_time.strftime("%H:%M"),
            "duration_minutes": task.estimated_min,
            "priority_score": calculate_priority_score(task),
            "reason": f"Prioritas {task.importance}, tipe {task.type}. Dijadwalkan lebih awal karena skor prioritas tinggi."
        })

        # Majukan waktu untuk tugas berikutnya (tambah 15 menit istirahat antar tugas)
        current_time = task_end_time + timedelta(minutes=15)

    return schedule