# ZenoSphere

ZenoSphere adalah aplikasi *personal schedule & priority tracker* yang dirancang untuk membantu menyeimbangkan aktivitas akademik, pengembangan diri, dan waktu istirahat. 

Aplikasi ini menggunakan algoritma penjadwalan deterministik untuk menyusun prioritas tugas berdasarkan tingkat kepentingan dan tenggat waktu (deadline), memastikan jadwal yang dihasilkan konsisten dan masuk akal.

## Fitur Saat Ini (MVP)
- [x] REST API menggunakan FastAPI.
- [x] Penyimpanan database lokal menggunakan SQLite & SQLModel.
- [x] Algoritma *Priority Scoring* (menghitung skor berdasarkan importance dan deadline).
- [x] Algoritma *Scheduler* (menyusun tugas ke dalam blok waktu harian secara otomatis).
- [x] Antarmuka Frontend modern menggunakan React (TypeScript), Vite, dan Tailwind CSS.
- [x] Dashboard untuk melihat jadwal harian beserta alasan penempatan waktunya.

## Fitur dalam Pengembangan
- [ ] Integrasi LLM (Groq/OpenAI) untuk *Quick Add* (parsing input bahasa natural).
- [ ] Penjelasan jadwal menggunakan LLM.
- [ ] Sinkronisasi dua arah dengan Google Calendar.

## Tech Stack
**Backend:**
- Python 3.12+
- FastAPI & Uvicorn
- SQLModel (SQLite)

**Frontend:**
- React (TypeScript)
- Vite
- Tailwind CSS

---

## Cara Menjalankan Proyek (Local Development)

### 1. Prasyarat
Pastikan komputer sudah terinstal:
- [Python](https://www.python.org/downloads/) (Disarankan versi 3.12)
- [Node.js](https://nodejs.org/) (Versi LTS)
- Git

### 2. Setup Backend (FastAPI)
Buka terminal, masuk ke folder proyek, lalu jalankan:

```powershell
# Masuk ke folder backend
cd backend

# Buat virtual environment (jika belum ada)
python -m venv .venv

# Aktifkan virtual environment (Windows)
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install fastapi "uvicorn[standard]" sqlmodel google-api-python-client google-auth-oauthlib google-auth-httplib2 python-dotenv pydantic openai

# Jalankan server backend
python -m uvicorn main:app --reload
```

_Backend akan berjalan di http://localhost:8000. Dokumentasi API (Swagger UI) dapat diakses di http://localhost:8000/docs._

### Setup Frontend (React)
Buka terminal baru (biarkan terminal backend tetap berjalan), lalu jalankan:

```powershell
# Masuk ke folder frontend
cd frontend

# Install dependencies
npm install

# Jalankan server frontend
npm run dev
```

_Frontend akan berjalan di http://localhost:5173._


## Struktur Folder
```
ZenoSphere/
├── backend/
│   ├── .venv/               # Python Virtual Environment
│   ├── main.py              # Entry point FastAPI & Routing
│   ├── db.py                # Konfigurasi Database SQLite
│   ├── models.py            # Skema Database (SQLModel)
│   ├── priority.py          # Logika perhitungan skor prioritas
│   ├── scheduler.py         # Algoritma penyusunan jadwal
│   └── zenosphere.db        # File database SQLite (auto-generated)
├── frontend/
│   ├── src/                 # Kode React (App.tsx, index.css, dll)
│   ├── package.json         # Dependensi Node.js
│   └── tailwind.config.js   # Konfigurasi Tailwind CSS
├── .gitignore
└── README.md
```

## API Endpoints

- `GET /api/health` - Cek status server.

- `POST /api/tasks` - Menambahkan tugas baru.

- `GET /api/tasks` - Melihat semua daftar tugas.

- `GET /api/schedule` - Mendapatkan jadwal harian yang sudah diurutkan berdasarkan prioritas.

## Catatan Pengembangan
- Proyek ini menggunakan pendekatan monorepo (Backend dan Frontend terpisah namun berada dalam satu repositori).
- Penjadwalan dilakukan secara deterministik menggunakan Python. LLM hanya akan digunakan sebagai parser input dan pemberi alasan agar hasil jadwal tidak berhalusinasi.