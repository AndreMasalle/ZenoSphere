import os
import json
from typing import cast
from openai import OpenAI
from openai.types.chat import ChatCompletionMessageParam
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)


def analyze_task(title: str, description: str, user_context: str, new_start_time: str, existing_schedule: str) -> dict:
    prompt = f"""
    Analisis tugas/kegiatan berikut dan ekstrak parameternya.

    KONTEKS PENGGUNA:
    "{user_context}"

    Teks Tugas Baru: "{title}" - "{description}"
    Waktu Mulai Tugas Baru: {new_start_time}

    JADWAL YANG SUDAH ADA (DATABASE):
    {existing_schedule if existing_schedule else "Belum ada jadwal lain."}

    ATURAN EKSTRAKSI WAJIB:
    1. "type": akademik, olahraga, belajar, santai, general.
    2. "importance": 1-5 berdasarkan konteks.
    3. "reason": Alasan prioritas berdasarkan konteks.
    4. "warning": Penjelasan singkat mengapa ini bentrok/distraksi. Jika aman, isi "".
    5. "action": Pilih satu aksi dengan aturan ketat berikut:
       - "block": Jika tugas baru ini murni distraksi (main game 20 jam).
       - "reschedule": JIKA TUGAS BARU INI BENTROK JAMNYA DENGAN "JADWAL YANG SUDAH ADA" di atas, DAN tugas ini penting/tidak boleh dihapus (misal: Kencan, Appointment). Sistem akan menggeser jadwal ini ke waktu lain.
       - "keep": Jika jadwal aman (tidak bentrok), atau ini tugas utama.
    6. "preferred_period": "morning", "afternoon", "evening", atau "any".
    7. "max_session_min": Default 90.
    8. "break_min": Default 15.

    Kembalikan HANYA JSON:
    {{
        "type": "santai",
        "importance": 2,
        "reason": "...",
        "warning": "",
        "action": "keep",
        "preferred_period": "evening",
        "max_session_min": 90,
        "break_min": 15
    }}
    """
    messages_data = [
        {"role": "system", "content": "You are an intelligent scheduling assistant designed to output JSON."},
        {"role": "user", "content": prompt}
    ]

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=cast(list[ChatCompletionMessageParam], messages_data),
            response_format={"type": "json_object"},
            temperature=0.1
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"Error LLM: {e}")
        return {"type": "general", "importance": 3, "reason": "", "warning": "", "action": "keep",
                "preferred_period": "any", "max_session_min": 90, "break_min": 15}