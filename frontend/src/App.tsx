import { useEffect, useState } from 'react'
import './App.css'

// Tipe data sesuai dengan response dari FastAPI
interface ScheduleBlock {
  task_id: number;
  title: string;
  type: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  priority_score: number;
  reason: string;
}

function App() {
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fungsi untuk mengambil data dari backend
  const fetchSchedule = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/api/schedule');
      if (!response.ok) throw new Error('Gagal mengambil data');

      const data = await response.json();
      setSchedule(data.schedule_blocks);
    } catch (err) {
      setError('Gagal terhubung ke server backend. Pastikan Uvicorn menyala.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Jalankan fungsi saat halaman pertama kali dibuka
  useEffect(() => {
    fetchSchedule();
  }, []);

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      {/* Header */}
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-bold text-blue-600 mb-2">ZenoSphere</h1>
        <p className="text-gray-600">Smart Schedule & Priority Tracker</p>
      </header>

      {/* Konten Utama */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex justify-between items-center mb-6 border-b pb-4">
          <h2 className="text-2xl font-semibold text-gray-800">Jadwal Hari Ini</h2>
          <button
            onClick={fetchSchedule}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Refresh Jadwal
          </button>
        </div>

        {/* State: Loading */}
        {loading && (
          <div className="text-center py-10 text-gray-500">Memuat jadwal...</div>
        )}

        {/* State: Error */}
        {error && (
          <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-4">{error}</div>
        )}

        {/* State: Kosong */}
        {!loading && !error && schedule.length === 0 && (
          <div className="text-center py-10 text-gray-500">
            Belum ada tugas. Silakan tambah tugas di API (/docs).
          </div>
        )}

        {/* State: Ada Data */}
        <div className="space-y-4">
          {schedule.map((block, index) => (
            <div key={index} className="flex flex-col md:flex-row md:items-center p-4 border rounded-lg hover:shadow-sm transition-shadow bg-gray-50">
              {/* Waktu */}
              <div className="md:w-1/4 mb-2 md:mb-0">
                <span className="text-lg font-bold text-blue-700">{block.start_time}</span>
                <span className="text-gray-500 mx-2">-</span>
                <span className="text-gray-600">{block.end_time}</span>
                <div className="text-xs text-gray-400 mt-1">{block.duration_minutes} menit</div>
              </div>

              {/* Info Tugas */}
              <div className="md:w-2/4 border-l-2 border-blue-300 pl-4">
                <h3 className="text-lg font-semibold text-gray-800">{block.title}</h3>
                <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mt-1">
                  {block.type}
                </span>
              </div>

              {/* Alasan */}
              <div className="md:w-1/4 mt-3 md:mt-0 text-sm text-gray-500 italic bg-white p-2 rounded border">
                "{block.reason}"
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App