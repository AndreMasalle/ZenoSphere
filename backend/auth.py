import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow

router = APIRouter()

SCOPES = ['https://www.googleapis.com/auth/calendar.events']
REDIRECT_URI = 'http://localhost:8000/api/auth/google/callback'
CREDENTIALS_FILE = 'credentials.json'

# Dictionary sementara untuk menyimpan code_verifier berdasarkan 'state'
# Catatan: Untuk production, gunakan database atau Redis, bukan memori.
oauth_states = {}


@router.get("/login")
def google_login():
    """Mengembalikan URL otorisasi Google."""
    flow = Flow.from_client_secrets_file(
        CREDENTIALS_FILE,
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI
    )
    # authorization_url mengembalikan URL dan 'state' (string acak)
    auth_url, state = flow.authorization_url(prompt='consent', access_type='offline')

    # Simpan code_verifier dengan key 'state'
    oauth_states[state] = flow.code_verifier

    return {"auth_url": auth_url}


@router.get("/callback")
def google_callback(code: str, state: str):
    """Menerima kode otorisasi dan menyimpannya sebagai token.json."""

    # Ambil code_verifier yang disimpan sebelumnya
    code_verifier = oauth_states.get(state)
    if not code_verifier:
        raise HTTPException(status_code=400, detail="State tidak valid atau sesi telah berakhir.")

    flow = Flow.from_client_secrets_file(
        CREDENTIALS_FILE,
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI
    )

    # Kembalikan code_verifier ke dalam flow sebelum menukar token
    flow.code_verifier = code_verifier

    try:
        flow.fetch_token(code=code)
    except Exception as e:
        # Hapus state jika gagal
        oauth_states.pop(state, None)
        print(f"OAuth Error: {e}")
        raise HTTPException(status_code=500, detail="Gagal menukar kode otorisasi dengan token.")

    creds = flow.credentials

    # Simpan token ke file
    with open('token.json', 'w') as token:
        token.write(creds.to_json())

    # Hapus state setelah berhasil digunakan
    oauth_states.pop(state, None)

    # Alihkan kembali ke frontend setelah berhasil
    return RedirectResponse(url="http://localhost:5173")