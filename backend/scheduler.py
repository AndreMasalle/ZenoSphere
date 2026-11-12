from datetime import datetime, timezone, timedelta
from typing import List
from models import Task
from priority import calculate_priority_score


def generate_schedule(tasks: List[Task]) -> dict:
    valid_tasks = []
    warned_tasks = []

    for t in tasks:
        if t.status == "done":
            continue
        if t.action == "block":
            warned_tasks.append(t)
        else:
            valid_tasks.append(t)

    now = datetime.now(timezone.utc)
    local_tz = timezone(timedelta(hours=7))

    # Pengurutan: Skor Prioritas -> Waktu Mulai -> ID
    sorted_valid = sorted(
        valid_tasks,
        key=lambda x: (
            -calculate_priority_score(x),
            x.start_time if x.start_time else now + timedelta(days=999),
            x.id
        )
    )

    schedule_blocks = []
    occupied_slots = []

    for task in sorted_valid:
        start = task.start_time if task.start_time else now
        remaining_min = task.estimated_min
        max_session = task.max_session_min if task.max_session_min else 90
        break_min = task.break_min if task.break_min else 15
        session_count = 1
        current_start = start

        while remaining_min > 0:
            current_duration = min(remaining_min, max_session)
            current_end = current_start + timedelta(minutes=current_duration)

            start_loc = current_start.astimezone(local_tz)
            end_loc = current_end.astimezone(local_tz)

            # DETEKSI BENTROK
            has_conflict = False
            conflict_with = None
            for occ_start, occ_end, occ_title in occupied_slots:
                occ_start_loc = occ_start.astimezone(local_tz)
                occ_end_loc = occ_end.astimezone(local_tz)

                if start_loc < occ_end_loc and end_loc > occ_start_loc:
                    has_conflict = True
                    conflict_with = occ_title
                    break

            occupied_slots.append((current_start, current_end, task.title))

            title_suffix = f" (Sesi {session_count})" if task.estimated_min > max_session else ""

            task_deadline_str = None
            raw_task_deadline = ""
            if task.task_deadline:
                task_deadline_str = task.task_deadline.astimezone(local_tz).strftime("%d %b %Y, %H:%M")
                raw_task_deadline = task.task_deadline.astimezone(local_tz).strftime("%Y-%m-%dT%H:%M")

            schedule_blocks.append({
                "task_id": task.id,
                "title": f"{task.title}{title_suffix}",
                "description": task.description,
                "item_type": task.item_type,
                "type": task.type,
                "date_str": start_loc.strftime("%A, %d %b %Y"),
                "start_time": start_loc.strftime("%H:%M"),
                "end_time": end_loc.strftime("%H:%M"),
                "raw_start_time": start_loc.strftime("%Y-%m-%dT%H:%M"),
                "duration_minutes": current_duration,
                "priority_score": calculate_priority_score(task),
                "importance": task.importance,
                "reason": task.reason if task.reason else f"Prioritas {task.importance}.",
                "warning": task.warning,
                "has_conflict": has_conflict,
                "conflict_with": conflict_with,
                "task_deadline": task_deadline_str,
                "raw_task_deadline": raw_task_deadline,
                "notify_minutes": task.notify_minutes
            })

            remaining_min -= current_duration
            current_start = current_end + timedelta(minutes=break_min)
            session_count += 1

    warned_blocks = []
    for task in warned_tasks:
        start = task.start_time if task.start_time else now
        start_local = start.astimezone(local_tz)
        end_local = (start + timedelta(minutes=task.estimated_min)).astimezone(local_tz)

        raw_task_deadline = ""
        if task.task_deadline:
            raw_task_deadline = task.task_deadline.astimezone(local_tz).strftime("%Y-%m-%dT%H:%M")

        warned_blocks.append({
            "task_id": task.id,
            "title": task.title,
            "description": task.description,
            "item_type": task.item_type,
            "type": task.type,
            "date_str": start_local.strftime("%A, %d %b %Y"),
            "start_time": start_local.strftime("%H:%M"),
            "end_time": end_local.strftime("%H:%M"),
            "raw_start_time": start_local.strftime("%Y-%m-%dT%H:%M"),
            "duration_minutes": task.estimated_min,
            "importance": task.importance,
            "reason": task.reason,
            "warning": task.warning or "AI mendeteksi ini sebagai distraksi.",
            "task_deadline": None,
            "raw_task_deadline": raw_task_deadline,
            "notify_minutes": task.notify_minutes
        })

    return {"schedule_blocks": schedule_blocks, "warned_blocks": warned_blocks}