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
    5. "action": Pilih satu aksi: "block" (jika distraksi), atau "keep" (jika valid).
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


def choose_best_slot(task_title: str, task_duration: int, slots: list, user_context: str) -> dict:
    slots_text = "\n".join([f"{i + 1}. {slot['label']}" for i, slot in enumerate(slots)])
    prompt = f"""
    Pengguna ingin memindahkan jadwal "{task_title}" (durasi {task_duration} menit) yang sebelumnya bentrok.
    KONTEKS PENGGUNA: "{user_context}"
    Berikut adalah 3 slot waktu kosong terdekat yang tersedia:
    {slots_text}

    Tugas: Pilih SATU slot terbaik dari daftar di atas dan berikan alasan logis mengapa slot tersebut dipilih berdasarkan konteks pengguna.
    Kembalikan HANYA JSON: {{"chosen_index": 1, "reason": "..."}}
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
            temperature=0.2
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"Error LLM (choose slot): {e}")
        return {"chosen_index": 1, "reason": "Gagal mendapatkan saran dari AI. Silakan pilih secara manual."}


def generate_weekly_review(stats_text: str, user_context: str) -> str:
    """Menghasilkan ulasan mingguan berdasarkan data statistik dan konteks pengguna."""
    prompt = f"""
    Anda adalah seorang mentor produktivitas dan work-life balance.

    KONTEKS PREFERENSI:
    "{user_context}"

    DATA STATISTIK MINGGU INI:
    {stats_text}

    Tugas: Berikan ulasan yang terdiri dari 2 paragraf.
    - Paragraf 1: Evaluasi keseimbangan hidup berdasarkan data (apakah santai berlebih, olahraga kurang, dll).
    - Paragraf 2: Satu saran actionable untuk minggu depan.

    ATURAN FORMAT:
    1. Gunakan **teks** (dua bintang) untuk menebalkan poin penting (seperti angka durasi atau saran utama).
    2. Pisahkan antar paragraf dengan satu karakter baris baru (Enter).
    3. Gunakan bahasa yang ramah dan personal (boleh menggunakan kata "kamu").
    """

    messages_data = [
        {"role": "system", "content": "You are a helpful productivity mentor. Output text with markdown bolding."},
        {"role": "user", "content": prompt}
    ]

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=cast(list[ChatCompletionMessageParam], messages_data),
            temperature=0.5
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Error LLM (weekly review): {e}")
        return "Gagal menghasilkan ulasan AI saat ini. Tetap semangat dan jaga keseimbangan hidup."