'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

const InternDetailPage = () => {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [intern, setIntern] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) router.push('/login');
    });

    const fetchData = async () => {
      try {
        // Fetch User Info
        const userSnap = await getDoc(doc(db, 'users', id));
        if (userSnap.exists()) {
          setIntern(userSnap.data());
        }

        // Fetch Attendance
        const qAttendance = query(
          collection(db, 'attendance'),
          where('userId', '==', id),
          orderBy('date', 'desc')
        );
        const attendSnap = await getDocs(qAttendance);
        setAttendance(attendSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Fetch Reports
        const qReports = query(
          collection(db, 'daily_reports'),
          where('userId', '==', id),
          orderBy('date', 'desc')
        );
        const reportSnap = await getDocs(qReports);
        setReports(reportSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchData();
    return () => unsubscribeAuth();
  }, [id]);

  if (loading) return <div className="text-gray-500 p-10 text-center">ກຳລັງໂຫຼດຂໍ້ມູນ...</div>;
  if (!intern) return <div className="text-red-500 p-10 text-center">ບໍ່ພົບຂໍ້ມູນນັກສຶກສາ</div>;

  return (
    <div className="space-y-8 pb-20">
      {/* Header & Profile */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-white flex items-center space-x-2 text-sm">
          <span>← Back to List</span>
        </button>
        <div className="text-right">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest">Profile: {id.substring(0, 8)}</p>
        </div>
      </div>

      <section className="bg-[#161b22] border border-gray-800 rounded-[2.5rem] p-8 flex flex-col md:flex-row items-center md:items-start gap-8">
        <div className="w-24 h-24 rounded-3xl bg-red-600/10 flex items-center justify-center font-black text-red-500 text-3xl border border-red-500/20">
          {intern.fullname?.charAt(0)}
        </div>
        <div className="flex-1 text-center md:text-left">
          <h1 className="text-3xl font-black text-white">{intern.fullname}</h1>
          <p className="text-gray-400 mt-1">{intern.email} • {intern.phone}</p>
          <div className="mt-6 flex flex-wrap gap-3 justify-center md:justify-start">
            <span className="px-4 py-1.5 bg-[#0d1117] border border-gray-800 rounded-full text-[11px] font-bold text-gray-400">🎓 {intern.college}</span>
            <span className="px-4 py-1.5 bg-[#0d1117] border border-gray-800 rounded-full text-[11px] font-bold text-gray-400">📖 {intern.major}</span>
            <span className="px-4 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full text-[11px] font-bold text-green-500">📅 {intern.startDate} - {intern.endDate}</span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Logs */}
        <section className="bg-[#161b22] border border-gray-800 rounded-[2.5rem] overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-800 bg-white/5">
            <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">Attendance History</h2>
          </div>
          <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
            {attendance.map((log) => (
              <div key={log.id} className="bg-[#0d1117] border border-gray-800 p-4 rounded-2xl flex justify-between items-center">
                <div>
                  <div className="text-xs font-bold text-gray-300">{log.date}</div>
                  <div className="flex items-center space-x-3 mt-1">
                    <span className="text-[10px] text-green-500 font-mono">IN: {log.checkInTime ? new Date(log.checkInTime).toLocaleTimeString() : '—'}</span>
                    <span className="text-[10px] text-red-500 font-mono">OUT: {log.checkOutTime ? new Date(log.checkOutTime).toLocaleTimeString() : '—'}</span>
                  </div>
                </div>
                <div className="text-right">
                   <div className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${log.status === 'Late' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
                    {log.status}
                  </div>
                </div>
              </div>
            ))}
            {attendance.length === 0 && <p className="text-gray-600 text-sm text-center py-10">No logs found</p>}
          </div>
        </section>

        {/* Reports */}
        <section className="bg-[#161b22] border border-gray-800 rounded-[2.5rem] overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-800 bg-white/5">
            <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">Daily Reports</h2>
          </div>
          <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
            {reports.map((report) => (
              <div key={report.id} className="bg-[#0d1117] border border-gray-800 p-5 rounded-2xl">
                <div className="text-[10px] font-black text-red-500 uppercase mb-2">{report.date}</div>
                <p className="text-xs text-gray-400 leading-relaxed">{report.content}</p>
              </div>
            ))}
            {reports.length === 0 && <p className="text-gray-600 text-sm text-center py-10">No reports found</p>}
          </div>
        </section>
      </div>
    </div>
  );
};

export default InternDetailPage;
