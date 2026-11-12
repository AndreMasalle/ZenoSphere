import { useEffect, useState } from 'react'
import './App.css'

interface ScheduleBlock {
  task_id: number;
  title: string;
  item_type: string;
  type: string;
  date_str: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  priority_score: number;
  importance: number;
  reason: string;
  warning?: string;
  has_conflict?: boolean;
  conflict_with?: string;
  task_deadline?: string;
  notify_minutes?: number;
}

function App() {
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([]);
  const [warnedTasks, setWarnedTasks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [itemType, setItemType] = useState<'event' | 'task' | 'appointment'>('task');
  const [startTime, setStartTime] = useState('');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [notifyMinutes, setNotifyMinutes] = useState(30);
  const [duration, setDuration] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [rulesText, setRulesText] = useState('');

  const [rescheduleTaskId, setRescheduleTaskId] = useState<number | null>(null);
  const [newStartTime, setNewStartTime] = useState('');

  const fetchSchedule = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/api/schedule');
      if (!response.ok) throw new Error('Gagal mengambil data');
      const data = await response.json();
      setSchedule(data.schedule_blocks || []);
      setWarnedTasks(data.warned_blocks || []);
      setError('');
    } catch (err) {
      setError('Gagal terhubung ke server backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSchedule(); }, []);

  const fetchRules = async () => {
    const res = await fetch('http://localhost:8000/api/rules');
    const data = await res.json();
    setRulesText(data.rule_text);
  };

  const saveRules = async () => {
    await fetch('http://localhost:8000/api/rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule_text: rulesText }),
    });
    setShowSettings(false);
  };

  const handleConnectGcal = async () => {
    const response = await fetch('http://localhost:8000/api/auth/google/login');
    const data = await response.json();
    window.location.href = data.auth_url;
  };

  const handleSyncGcal = async () => {
    setIsSyncing(true);
    setSyncMessage('Menyinkronkan...');
    try {
      const response = await fetch('http://localhost:8000/api/sync-gcal', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Gagal sinkronisasi');
      setSyncMessage(data.status === 'partial_success' ? `Peringatan: ${data.errors.join(', ')}` : data.message);
      setTimeout(() => setSyncMessage(''), 5000);
    } catch (err: any) {
      setSyncMessage(`Error: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startTime) return;

    setIsSubmitting(true);
    setFormError('');
    try {
      const payload: any = {
        title,
        description,
        item_type: itemType,
        start_time: startTime,
        estimated_min: Number(duration)
      };

      if (itemType === 'task') payload.task_deadline = taskDeadline || null;
      if (itemType === 'appointment') payload.notify_minutes = Number(notifyMinutes);

      const response = await fetch('http://localhost:8000/api/tasks/smart-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Gagal memproses AI');

      setTitle(''); setDescription(''); setStartTime(''); setTaskDeadline(''); setDuration(60);
      await fetchSchedule();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleDone = async (taskId: number) => {
    await fetch(`http://localhost:8000/api/tasks/${taskId}/status`, { method: 'PATCH' });
    await fetchSchedule();
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!confirm('Hapus jadwal ini?')) return;
    try {
      const response = await fetch(`http://localhost:8000/api/tasks/${taskId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Gagal menghapus tugas dari server');
      }
      await fetchSchedule();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTaskId || !newStartTime) return;

    try {
      const response = await fetch(`http://localhost:8000/api/tasks/${rescheduleTaskId}/reschedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_start_time: newStartTime }),
      });

      if (!response.ok) throw new Error('Gagal mengubah jadwal');

      setRescheduleTaskId(null);
      setNewStartTime('');
      await fetchSchedule();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const groupedSchedule = schedule.reduce((acc, task) => {
    const date = task.date_str;
    if (!acc[date]) acc[date] = [];
    acc[date].push(task);
    return acc;
  }, {} as Record<string, ScheduleBlock[]>);

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'event': return 'bg-purple-100 text-purple-700';
      case 'appointment': return 'bg-pink-100 text-pink-700';
      default: return 'bg-blue-100 text-blue-700';
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto">
      <header className="mb-10 relative text-center">
        <button onClick={() => { setShowSettings(true); fetchRules(); }} className="absolute top-0 right-0 bg-white border border-gray-300 p-2 rounded-full hover:bg-gray-100 shadow-sm">⚙️</button>
        <h1 className="text-4xl font-bold text-blue-600 mb-2">ZenoSphere</h1>
        <p className="text-gray-600 mb-6">Smart Schedule & Priority Tracker</p>

        <div className="flex flex-col items-center gap-2">
          <div className="flex justify-center gap-4">
            <button onClick={handleConnectGcal} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 shadow-sm">Hubungkan Google Calendar</button>
            <button onClick={handleSyncGcal} disabled={isSyncing} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm disabled:bg-green-300">
              {isSyncing ? 'Memproses...' : 'Sync ke Google Calendar'}
            </button>
          </div>
          {syncMessage && <p className="text-sm text-gray-700 mt-2">{syncMessage}</p>}
        </div>
      </header>

      <div className="bg-white rounded-xl shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Tambah Jadwal Baru</h2>
        {formError && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">{formError}</div>}

        <div className="flex gap-2 mb-6 border-b pb-2">
          {['event', 'task', 'appointment'].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setItemType(type as any)}
              className={`px-4 py-2 rounded-t-lg font-medium text-sm capitalize transition-colors ${
                itemType === type
                  ? type === 'event' ? 'bg-purple-100 text-purple-700 border-b-2 border-purple-500'
                  : type === 'task' ? 'bg-blue-100 text-blue-700 border-b-2 border-blue-500'
                  : 'bg-pink-100 text-pink-700 border-b-2 border-pink-500'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        <form onSubmit={handleAddTask} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Judul</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi (Opsional)</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{itemType === 'task' ? 'Waktu Pengerjaan' : 'Waktu Mulai'}</label>
            <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500" />
          </div>

          {itemType === 'task' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
              <input type="datetime-local" value={taskDeadline} onChange={(e) => setTaskDeadline(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500" />
            </div>
          )}

          {itemType === 'appointment' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notifikasi Sebelum (Menit)</label>
              <select value={notifyMinutes} onChange={(e) => setNotifyMinutes(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500">
                <option value={10}>10 Menit</option>
                <option value={30}>30 Menit</option>
                <option value={60}>1 Jam</option>
                <option value={1440}>1 Hari</option>
              </select>
            </div>
          )}

          {itemType !== 'task' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Durasi (Menit)</label>
              <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} required min="15" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500" />
            </div>
          )}

          <div className="md:col-span-2 flex justify-end mt-2">
            <button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:bg-blue-300">
              {isSubmitting ? 'AI Menganalisis...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex justify-between items-center mb-6 border-b pb-4">
          <h2 className="text-2xl font-semibold text-gray-800">Jadwal Mendatang (7 Hari)</h2>
          <button onClick={fetchSchedule} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium">Refresh</button>
        </div>

        {loading && <div className="text-center py-10 text-gray-500">Memuat jadwal...</div>}
        {error && <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-4">{error}</div>}

        {!loading && !error && schedule.length === 0 && <div className="text-center py-10 text-gray-500">Belum ada jadwal mendatang.</div>}

        <div className="space-y-8">
          {Object.entries(groupedSchedule).map(([date, tasks]) => (
            <div key={date}>
              <h3 className="text-lg font-bold text-gray-700 mb-3 border-b pb-2">{date}</h3>
              <div className="space-y-4">
                {tasks.map((block) => (
                  // PERBAIKAN REACT KEY: Gunakan gabungan task_id dan start_time
                  <div key={`${block.task_id}-${block.start_time}`} className={`relative flex flex-col md:flex-row md:items-center p-4 pt-10 md:pt-4 border rounded-lg hover:shadow-sm gap-4 ${block.has_conflict ? 'bg-red-50 border-red-400' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="absolute top-3 right-3 md:top-4 md:right-4">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${block.importance >= 4 ? 'bg-red-100 text-red-700' : block.importance === 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                        Priority: {block.importance}
                      </span>
                    </div>
                    <div className="md:w-1/6 shrink-0">
                      <span className="text-lg font-bold text-blue-700">{block.start_time}</span>
                      <span className="text-gray-500 mx-1">-</span>
                      <span className="text-gray-600">{block.end_time}</span>
                      <div className="text-xs text-gray-400 mt-1">{block.duration_minutes} mnt</div>
                    </div>
                    <div className="md:w-2/6 md:border-l-2 md:border-blue-300 md:pl-4">
                      <div className="flex flex-wrap gap-2 mb-1">
                        <span className={`inline-block text-xs px-2 py-1 rounded font-bold uppercase tracking-wider ${getTypeBadge(block.item_type)}`}>{block.item_type}</span>
                        <span className="inline-block bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded">{block.type}</span>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-800 leading-tight">{block.title}</h3>

                      {block.item_type === 'task' && block.task_deadline && (
                        <div className="text-sm font-semibold text-red-600 mt-2">⏰ Deadline: {block.task_deadline}</div>
                      )}
                      {block.item_type === 'appointment' && block.notify_minutes && (
                        <div className="text-sm font-medium text-pink-600 mt-2">🔔 Notifikasi: {block.notify_minutes} menit sebelum</div>
                      )}
                    </div>
                    <div className="md:w-3/6 flex flex-col gap-3">

                      {block.has_conflict && (
                        <div className="bg-red-100 text-red-700 p-3 rounded border border-red-300 text-sm font-semibold flex justify-between items-center">
                          <span>⚠️ Bentrok dengan: {block.conflict_with}</span>
                          <button
                            onClick={() => setRescheduleTaskId(block.task_id)}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs shrink-0 ml-2"
                          >
                            Ubah Jadwal
                          </button>
                        </div>
                      )}

                      <div className="text-sm text-gray-600 italic bg-white p-2 rounded border">"{block.reason}"</div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => handleToggleDone(block.task_id)} className="bg-green-100 text-green-700 hover:bg-green-200 px-4 py-1.5 rounded-lg text-sm font-semibold">✓ Selesai</button>
                        <button onClick={() => handleDeleteTask(block.task_id)} className="bg-red-100 text-red-700 hover:bg-red-200 px-4 py-1.5 rounded-lg text-sm font-semibold">✕ Hapus</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {warnedTasks.length > 0 && (
        <div className="bg-red-50 rounded-xl shadow-md p-6 mt-8 border-2 border-red-300">
          <h2 className="text-2xl font-bold text-red-700 mb-4 flex items-center gap-2">⚠️ Peringatan AI (Di-block)</h2>
          <p className="text-sm text-red-600 mb-4">Jadwal berikut dianggap sebagai distraksi. Tidak dimasukkan ke jadwal dan Google Calendar.</p>
          <div className="space-y-4">
            {warnedTasks.map((task) => (
              <div key={task.task_id} className="bg-white p-4 rounded-lg shadow-sm border border-red-200">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">{task.title}</h3>
                    <div className="flex gap-2 mt-1">
                       <span className={`text-xs px-2 py-1 rounded font-bold uppercase ${getTypeBadge(task.item_type)}`}>{task.item_type}</span>
                       <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{task.type} | {task.duration_minutes} mnt</span>
                    </div>
                  </div>
                </div>
                <div className="text-sm text-red-700 font-medium mb-2 mt-3">"{task.warning}"</div>
                <div className="flex justify-end gap-2 mt-3">
                  <button onClick={() => handleDeleteTask(task.task_id)} className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-1.5 rounded-lg text-sm font-semibold">✕ Abaikan & Hapus</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-2xl font-bold mb-4">⚙️ Konteks & Preferensi AI</h2>
            <textarea value={rulesText} onChange={(e) => setRulesText(e.target.value)} className="w-full h-48 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm" placeholder="Prioritaskan akademik dan olahraga..." />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Batal</button>
              <button onClick={saveRules} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {rescheduleTaskId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4">Ubah Waktu Jadwal</h2>
            <form onSubmit={handleReschedule}>
              <input
                type="datetime-local"
                value={newStartTime}
                onChange={(e) => setNewStartTime(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4 focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setRescheduleTaskId(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Batal</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Simpan Perubahan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App