import { useEffect, useState } from 'react'
import './App.css'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, ReferenceArea,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar
} from 'recharts'

interface ScheduleBlock {
  task_id: number;
  title: string;
  description?: string;
  item_type: string;
  type: string;
  date_str: string;
  start_time: string;
  end_time: string;
  raw_start_time: string;
  duration_minutes: number;
  priority_score: number;
  importance: number;
  reason: string;
  warning?: string;
  has_conflict?: boolean;
  conflict_with?: string;
  task_deadline?: string;
  raw_task_deadline?: string;
  notify_minutes?: number;
}

interface MatrixTask {
  id: number;
  title: string;
  x_urgency: number;
  y_importance: number;
  quadrant: string;
  item_type: string;
  days_left: number;
  duration: number;
}

interface AnalyticsData {
  radar_data: { subject: string; A: number; fullMark: number }[];
  daily_data: { day: string; minutes: number }[];
  ai_review: string;
  total_done: number;
  total_pending: number;
}

function App() {
  const [activeTab, setActiveTab] = useState<'schedule' | 'matrix' | 'analytics'>('schedule');
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([]);
  const [matrixData, setMatrixData] = useState<MatrixTask[]>([]);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
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

  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editItemType, setEditItemType] = useState<'event' | 'task' | 'appointment'>('task');
  const [editStartTime, setEditStartTime] = useState('');
  const [editTaskDeadline, setEditTaskDeadline] = useState('');
  const [editNotifyMinutes, setEditNotifyMinutes] = useState(30);
  const [editDuration, setEditDuration] = useState(60);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState('');

  const [rescheduleData, setRescheduleData] = useState<any>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [rulesText, setRulesText] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [scheduleRes, matrixRes, analyticsRes] = await Promise.all([
        fetch('http://localhost:8000/api/schedule'),
        fetch('http://localhost:8000/api/matrix'),
        fetch('http://localhost:8000/api/analytics')
      ]);
      if (!scheduleRes.ok || !matrixRes.ok || !analyticsRes.ok) throw new Error('Gagal mengambil data');

      const scheduleData = await scheduleRes.json();
      const matrixData = await matrixRes.json();
      const analyticsData = await analyticsRes.json();

      setSchedule(scheduleData.schedule_blocks || []);
      setWarnedTasks(scheduleData.warned_blocks || []);
      setMatrixData(matrixData.matrix || []);
      setAnalyticsData(analyticsData);
      setError('');
    } catch (err) {
      setError('Gagal terhubung ke server backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

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
    fetchData();
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
        title, description, item_type: itemType, start_time: startTime, estimated_min: Number(duration)
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
      await fetchData();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (task: ScheduleBlock) => {
    setEditingTaskId(task.task_id);
    setEditTitle(task.title.replace(/ \(Sesi \d+\)$/, ''));
    setEditDescription(task.description || '');
    setEditItemType(task.item_type as any);
    setEditStartTime(task.raw_start_time || '');
    setEditTaskDeadline(task.raw_task_deadline || '');
    setEditNotifyMinutes(task.notify_minutes || 30);
    setEditDuration(task.duration_minutes);
    setEditError('');
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTaskId || !editTitle.trim() || !editStartTime) return;
    setIsUpdating(true);
    setEditError('');
    try {
      const payload: any = {
        title: editTitle, description: editDescription, item_type: editItemType,
        start_time: editStartTime, estimated_min: Number(editDuration)
      };
      if (editItemType === 'task') payload.task_deadline = editTaskDeadline || null;
      if (editItemType === 'appointment') payload.notify_minutes = Number(editNotifyMinutes);

      const response = await fetch(`http://localhost:8000/api/tasks/${editingTaskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Gagal mengubah jadwal');
      }
      setEditingTaskId(null);
      await fetchData();
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSmartReschedule = async (taskId: number) => {
    setIsSuggesting(true);
    setRescheduleData(null);
    try {
      const response = await fetch(`http://localhost:8000/api/tasks/${taskId}/suggest-reschedule`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Gagal mencari saran');
      setRescheduleData(data);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsSuggesting(false);
    }
  };

  const acceptReschedule = async () => {
    if (!rescheduleData) return;
    try {
      const response = await fetch(`http://localhost:8000/api/tasks/${rescheduleData.task_id}/reschedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_start_time: rescheduleData.suggested_time_iso }),
      });
      if (!response.ok) throw new Error('Gagal memindahkan jadwal');
      setRescheduleData(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleDone = async (taskId: number) => {
    await fetch(`http://localhost:8000/api/tasks/${taskId}/status`, { method: 'PATCH' });
    await fetchData();
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!confirm('Hapus jadwal ini?')) return;
    try {
      const response = await fetch(`http://localhost:8000/api/tasks/${taskId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Gagal menghapus');
      await fetchData();
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

  const getScatterColor = (item_type: string) => {
    if (item_type === 'event') return '#a855f7';
    if (item_type === 'appointment') return '#ec4899';
    return '#3b82f6';
  };

  // --- FUNGSI UNTUK MEMFORMAT TEKS MARKDOWN AI MENJADI PARAGRAF & BOLD ---
  const formatReviewText = (text: string) => {
    return text.split('\n').filter(p => p.trim() !== '').map((paragraph, i) => {
      // Memisahkan teks berdasarkan tanda ** untuk mencari teks yang di-bold
      const parts = paragraph.split('**');
      return (
        <p key={i} className="mb-4 last:mb-0 leading-relaxed text-gray-700">
          {parts.map((part, index) =>
            // Jika index ganjil, berarti itu adalah teks di antara ** dan ** (jadi di-bold)
            index % 2 === 1 ? <strong key={index} className="text-gray-900 font-semibold">{part}</strong> : <span key={index}>{part}</span>
          )}
        </p>
      );
    });
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border rounded shadow-lg text-sm">
          <p className="font-bold text-gray-800">{data.title}</p>
          <p className="text-gray-600">Tipe: <span className="capitalize">{data.item_type}</span></p>
          <p className="text-gray-600">Durasi: {data.duration} menit</p>
          <p className="text-gray-600">Sisa Waktu: {data.days_left < 0 ? 'Overdue' : `${data.days_left} hari`}</p>
          <p className="font-semibold text-blue-600 mt-1">{data.quadrant}</p>
        </div>
      );
    }
    return null;
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
            <button key={type} type="button" onClick={() => setItemType(type as any)} className={`px-4 py-2 rounded-t-lg font-medium text-sm capitalize transition-colors ${itemType === type ? type === 'event' ? 'bg-purple-100 text-purple-700 border-b-2 border-purple-500' : type === 'task' ? 'bg-blue-100 text-blue-700 border-b-2 border-blue-500' : 'bg-pink-100 text-pink-700 border-b-2 border-pink-500' : 'text-gray-500 hover:bg-gray-50'}`}>{type}</button>
          ))}
        </div>
        <form onSubmit={handleAddTask} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Judul</label><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500" /></div>
          <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi (Opsional)</label><input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">{itemType === 'task' ? 'Waktu Pengerjaan' : 'Waktu Mulai'}</label><input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500" /></div>
          {itemType === 'task' && (<div><label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label><input type="datetime-local" value={taskDeadline} onChange={(e) => setTaskDeadline(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500" /></div>)}
          {itemType === 'appointment' && (<div><label className="block text-sm font-medium text-gray-700 mb-1">Notifikasi Sebelum (Menit)</label><select value={notifyMinutes} onChange={(e) => setNotifyMinutes(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"><option value={10}>10 Menit</option><option value={30}>30 Menit</option><option value={60}>1 Jam</option><option value={1440}>1 Hari</option></select></div>)}
          {itemType !== 'task' && (<div><label className="block text-sm font-medium text-gray-700 mb-1">Durasi (Menit)</label><input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} required min="15" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500" /></div>)}
          <div className="md:col-span-2 flex justify-end mt-2"><button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:bg-blue-300">{isSubmitting ? 'AI Menganalisis...' : 'Simpan'}</button></div>
        </form>
      </div>

      <div className="flex justify-center mb-6">
        <div className="bg-gray-200 p-1 rounded-lg inline-flex">
          <button onClick={() => setActiveTab('schedule')} className={`px-6 py-2 rounded-md font-medium text-sm transition-all ${activeTab === 'schedule' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-800'}`}>📅 Jadwal</button>
          <button onClick={() => setActiveTab('matrix')} className={`px-6 py-2 rounded-md font-medium text-sm transition-all ${activeTab === 'matrix' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-800'}`}>🎯 Matrix</button>
          <button onClick={() => setActiveTab('analytics')} className={`px-6 py-2 rounded-md font-medium text-sm transition-all ${activeTab === 'analytics' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-800'}`}>📊 Review</button>
        </div>
      </div>

      {activeTab === 'schedule' && (
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex justify-between items-center mb-6 border-b pb-4">
            <h2 className="text-2xl font-semibold text-gray-800">Daftar Jadwal (7 Hari)</h2>
            <button onClick={fetchData} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium">Refresh</button>
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
                    <div key={`${block.task_id}-${block.start_time}`} className={`relative flex flex-col md:flex-row md:items-center p-4 pt-10 md:pt-4 border rounded-lg hover:shadow-sm gap-4 ${block.has_conflict ? 'bg-red-50 border-red-400' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="absolute top-3 right-3 md:top-4 md:right-4"><span className={`text-xs font-bold px-3 py-1 rounded-full ${block.importance >= 4 ? 'bg-red-100 text-red-700' : block.importance === 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>Priority: {block.importance}</span></div>
                      <div className="md:w-1/6 shrink-0"><span className="text-lg font-bold text-blue-700">{block.start_time}</span><span className="text-gray-500 mx-1">-</span><span className="text-gray-600">{block.end_time}</span><div className="text-xs text-gray-400 mt-1">{block.duration_minutes} mnt</div></div>
                      <div className="md:w-2/6 md:border-l-2 md:border-blue-300 md:pl-4">
                        <div className="flex flex-wrap gap-2 mb-1"><span className={`inline-block text-xs px-2 py-1 rounded font-bold uppercase tracking-wider ${getTypeBadge(block.item_type)}`}>{block.item_type}</span><span className="inline-block bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded">{block.type}</span></div>
                        <h3 className="text-lg font-semibold text-gray-800 leading-tight">{block.title}</h3>
                        {block.item_type === 'task' && block.task_deadline && (<div className="text-sm font-semibold text-red-600 mt-2">⏰ Deadline: {block.task_deadline}</div>)}
                        {block.item_type === 'appointment' && block.notify_minutes && (<div className="text-sm font-medium text-pink-600 mt-2">🔔 Notifikasi: {block.notify_minutes} menit sebelum</div>)}
                      </div>
                      <div className="md:w-3/6 flex flex-col gap-3">
                        {block.has_conflict && (
                          <div className="bg-red-100 text-red-700 p-3 rounded border border-red-300 text-sm font-semibold flex flex-col gap-2">
                            <div className="flex justify-between items-center"><span>⚠️ Bentrok dengan: {block.conflict_with}</span><button onClick={() => openEditModal(block)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs shrink-0 ml-2">Ubah Manual</button></div>
                            <button onClick={() => handleSmartReschedule(block.task_id)} className="bg-purple-600 hover:bg-purple-700 text-white w-full py-1.5 rounded font-medium text-xs flex items-center justify-center gap-1">✨ Smart Reschedule (Saran AI)</button>
                          </div>
                        )}
                        <div className="text-sm text-gray-600 italic bg-white p-2 rounded border">"{block.reason}"</div>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => openEditModal(block)} className="bg-yellow-100 text-yellow-700 hover:bg-yellow-200 px-4 py-1.5 rounded-lg text-sm font-semibold">✏️ Edit</button>
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
      )}

      {activeTab === 'matrix' && (
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="mb-6 border-b pb-4"><h2 className="text-2xl font-semibold text-gray-800">Eisenhower Matrix</h2><p className="text-sm text-gray-500 mt-1">Visualisasi prioritas. Sumbu X adalah <b>Urgensi</b>, Sumbu Y adalah <b>Kepentingan</b>, dan ukuran gelembung adalah <b>Durasi</b>.</p></div>
          {matrixData.length === 0 ? (<div className="text-center py-10 text-gray-500">Belum ada data tugas untuk dianalisis.</div>) : (
            <div className="w-full h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <ReferenceLine x={1.5} stroke="#6b7280" strokeWidth={2} />
                  <ReferenceLine y={3} stroke="#6b7280" strokeWidth={2} />
                  <ReferenceArea x1={0.5} x2={1.5} y1={3} y2={5.5} fill="#fef2f2" fillOpacity={0.6} />
                  <ReferenceArea x1={1.5} x2={2.5} y1={3} y2={5.5} fill="#eff6ff" fillOpacity={0.6} />
                  <ReferenceArea x1={0.5} x2={1.5} y1={0.5} y2={3} fill="#fefce8" fillOpacity={0.6} />
                  <ReferenceArea x1={1.5} x2={2.5} y1={0.5} y2={3} fill="#f9fafb" fillOpacity={0.6} />
                  <XAxis type="number" dataKey="x_urgency" name="Urgensi" domain={[0.5, 2.5]} ticks={[1, 2]} tickFormatter={(val) => val === 1 ? "Mendesak" : "Tidak Mendesak"} label={{ value: "Tingkat Urgensi", position: "bottom", offset: 0, fill: '#4b5563', fontWeight: 'bold' }} />
                  <YAxis type="number" dataKey="y_importance" name="Kepentingan" domain={[0.5, 5.5]} ticks={[1, 2, 3, 4, 5]} label={{ value: "Tingkat Kepentingan", angle: -90, position: "insideLeft", fill: '#4b5563', fontWeight: 'bold' }} />
                  <ZAxis type="number" dataKey="duration" range={[150, 600]} name="Durasi" unit=" mnt" />
                  <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter name="Tugas" data={matrixData} shape="circle">
                    {matrixData.map((entry, index) => (<Cell key={`cell-${index}`} fill={getScatterColor(entry.item_type)} fillOpacity={0.8} />))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex justify-center gap-6 mt-6 text-sm text-gray-600">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Task</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-500"></div> Event</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-pink-500"></div> Appointment</div>
          </div>
        </div>
      )}

      {activeTab === 'analytics' && analyticsData && (
        <div className="space-y-6">
          {/* AI REVIEW BOX */}
          <div className="bg-white border border-blue-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold text-blue-700 mb-3 flex items-center gap-2">
              <span>🤖</span> Ulasan AI
            </h2>
            <div className="text-gray-700">
              {formatReviewText(analyticsData.ai_review)}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* RADAR CHART: WORK LIFE BALANCE */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">Keseimbangan Kategori</h3>
              <div className="w-full h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={analyticsData.radar_data}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" />
                    <PolarRadiusAxis angle={30} domain={[0, 'dataMax']} />
                    <Radar name="Menit" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.5} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-center text-gray-500 mt-2">Semakin melebar, semakin banyak waktu yang dihabiskan.</p>
            </div>

            {/* BAR CHART: DAILY ACTIVITY */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">Total Menit per Hari</h3>
              <div className="w-full h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData.daily_data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tickFormatter={(val) => val.substring(0, 3)} />
                    <YAxis />
                    <Tooltip cursor={{ fill: '#f3f4f6' }} />
                    <Bar dataKey="minutes" fill="#10b981" radius={[4, 4, 0, 0]} name="Menit" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-center text-gray-500 mt-2">Aktivitas dihitung berdasarkan estimasi durasi tugas.</p>
            </div>
          </div>
        </div>
      )}

      {warnedTasks.length > 0 && activeTab === 'schedule' && (
        <div className="bg-red-50 rounded-xl shadow-md p-6 mt-8 border-2 border-red-300">
          <h2 className="text-2xl font-bold text-red-700 mb-4 flex items-center gap-2">⚠️ Peringatan AI (Di-block)</h2>
          <p className="text-sm text-red-600 mb-4">Jadwal berikut dianggap sebagai distraksi. Tidak dimasukkan ke jadwal dan Google Calendar.</p>
          <div className="space-y-4">
            {warnedTasks.map((task) => (
              <div key={task.task_id} className="bg-white p-4 rounded-lg shadow-sm border border-red-200">
                <div className="flex justify-between items-start mb-2"><div><h3 className="text-lg font-semibold text-gray-800">{task.title}</h3><div className="flex gap-2 mt-1"><span className={`text-xs px-2 py-1 rounded font-bold uppercase ${getTypeBadge(task.item_type)}`}>{task.item_type}</span><span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{task.type} | {task.duration_minutes} mnt</span></div></div></div>
                <div className="text-sm text-red-700 font-medium mb-2 mt-3">"{task.warning}"</div>
                <div className="flex justify-end gap-2 mt-3"><button onClick={() => handleDeleteTask(task.task_id)} className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-1.5 rounded-lg text-sm font-semibold">✕ Abaikan & Hapus</button></div>
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

      {editingTaskId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-xl font-bold mb-4">✏️ Edit Jadwal</h2>
            {editError && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">{editError}</div>}
            <form onSubmit={handleUpdateTask} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Judul</label><input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-4 py-2" /></div>
              <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label><input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="w-full border border-gray-300 rounded-lg px-4 py-2" /></div>
              <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Tipe</label><select value={editItemType} onChange={(e) => setEditItemType(e.target.value as any)} className="w-full border border-gray-300 rounded-lg px-4 py-2"><option value="event">Event</option><option value="task">Task</option><option value="appointment">Appointment</option></select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Waktu Mulai</label><input type="datetime-local" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-4 py-2" /></div>
              {editItemType === 'task' && (<div><label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label><input type="datetime-local" value={editTaskDeadline} onChange={(e) => setEditTaskDeadline(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-4 py-2" /></div>)}
              {editItemType === 'appointment' && (<div><label className="block text-sm font-medium text-gray-700 mb-1">Notifikasi (Menit)</label><select value={editNotifyMinutes} onChange={(e) => setEditNotifyMinutes(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-4 py-2"><option value={10}>10 Menit</option><option value={30}>30 Menit</option><option value={60}>1 Jam</option><option value={1440}>1 Hari</option></select></div>)}
              {editItemType !== 'task' && (<div><label className="block text-sm font-medium text-gray-700 mb-1">Durasi (Menit)</label><input type="number" value={editDuration} onChange={(e) => setEditDuration(Number(e.target.value))} required min="15" className="w-full border border-gray-300 rounded-lg px-4 py-2" /></div>)}
              <div className="md:col-span-2 flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => setEditingTaskId(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Batal</button>
                <button type="submit" disabled={isUpdating} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300">{isUpdating ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(isSuggesting || rescheduleData) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">✨ Smart Reschedule</h2>
            {isSuggesting ? (
              <div className="text-center py-8"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div><p className="text-gray-600">AI sedang mencari dan memilih slot waktu terbaik...</p></div>
            ) : rescheduleData ? (
              <div>
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-4"><p className="text-sm text-blue-800 font-semibold mb-2">Saran Waktu dari AI:</p><p className="text-lg font-bold text-blue-900">{rescheduleData.suggested_time}</p></div>
                <div className="bg-gray-50 p-4 rounded-lg border mb-6"><p className="text-sm text-gray-700 italic">"{rescheduleData.ai_reason}"</p></div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setRescheduleData(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Batal</button>
                  <button onClick={acceptReschedule} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium shadow-sm">Terima & Pindahkan</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

export default App