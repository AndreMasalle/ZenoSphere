from sqlmodel import create_engine, Session

# Nama file database SQLite
sqlite_file_name = "zenosphere.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

# check_same_thread=False diperlukan untuk SQLite di FastAPI
engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

# Fungsi untuk mendapatkan session database (digunakan di endpoint nanti)
def get_session():
    with Session(engine) as session:
        yield session