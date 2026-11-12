from datetime import datetime, timezone
from models import Task


def calculate_priority_score(task: Task) -> float:
    now = datetime.now(timezone.utc)

    # 1. Tentukan tingkat "Mendesak" (Urgency)
    is_urgent = False

    # Gunakan task_deadline jika itu Task, atau start_time jika Event/Appointment
    target_deadline = task.task_deadline if task.task_deadline else task.start_time

    if target_deadline:
        deadline = target_deadline
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)

        days_left = (deadline - now).total_seconds() / 86400
        # Anggap mendesak jika deadline/start_time kurang dari 2 hari
        if days_left <= 2:
            is_urgent = True

    # Override: Jika importance 5, paksa mendesak
    if task.importance == 5:
        is_urgent = True

    # 2. Tentukan tingkat "Penting" (Importance)
    # Tugas santai secara default dianggap tidak penting, kecuali user memberi importance 4-5
    is_important = True
    if task.importance <= 2:
        is_important = False
    elif task.type == 'santai' and task.importance <= 3:
        is_important = False

    # 3. Kalkulasi Skor Eisenhower Matrix
    if is_important and is_urgent:
        # Kuadran 1: Lakukan Segera (Penting & Mendesak)
        return 100.0 + (task.importance * 10)
    elif is_important and not is_urgent:
        # Kuadran 2: Jadwalkan (Penting & Tidak Mendesak)
        return 70.0 + (task.importance * 10)
    elif not is_important and is_urgent:
        # Kuadran 3: Delegasikan / Selesaikan Cepat (Tidak Penting & Mendesak)
        return 40.0
    else:
        # Kuadran 4: Abaikan / Lakukan Nanti (Tidak Penting & Tidak Mendesak)
        return 10.0