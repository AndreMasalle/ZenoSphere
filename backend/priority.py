from datetime import datetime, timezone
from models import Task


def calculate_priority_score(task: Task) -> float:
    """
    Menghitung skor prioritas dari 0 ke atas.
    Semakin tinggi skornya, semakin cepat harus dikerjakan.
    """
    # 1. Bobot dari Importance (1-5) dikali 20 (jadi maksimal 100 poin)
    score = task.importance * 20

    # 2. Bobot dari Deadline (semakin dekat, semakin tinggi)
    if task.deadline:
        # Pastikan deadline punya timezone (UTC)
        deadline = task.deadline
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)
        days_left = (deadline - now).total_seconds() / (24 * 3600)

        if days_left < 0:
            score += 100  # Overdue! Kasih skor tertinggi
        elif days_left < 3:
            score += 50  # Deadline kurang dari 3 hari
        elif days_left < 7:
            score += 20  # Deadline kurang dari seminggu

    return score