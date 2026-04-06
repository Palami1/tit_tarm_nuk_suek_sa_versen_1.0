'use client';

import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRouter, useParams } from 'next/navigation';

// Removed misplaced static params

interface Intern {
  fullname: string;
  email: string;
  role: string;
}

interface AttendanceRecord {
  id: string;
  date: string;
  checkInTime: string;
  checkOutTime: string | null;
  workStatus: string;
  status: string;
}

const InternsListPage = () => {
  const params = useParams();
  const id = params?.id as string;
  const [intern, setIntern] = useState<Intern | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!id) return;

    // 1. ດຶງຂໍ້ມູນພື້ນຖານຂອງ Intern
    const fetchIntern = async () => {
      const docRef = doc(db, 'users', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setIntern(docSnap.data() as Intern);
      }
    };

    // 2. ດຶງປະຫວັດການລົງເວລາແບບ Real-time
    const q = query(
      collection(db, 'attendance'),
      where('internId', '==', id),
      orderBy('date', 'desc'),
      orderBy('checkInTime', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as AttendanceRecord[];
      setRecords(data);
      setLoading(false);
    });

    fetchIntern();
    return () => unsubscribe();
  }, [id]);

  if (loading) return <div className="p-10 text-center text-gray-500">ກຳລັງໂຫຼດຂໍ້ມູນ...</div>;

  return (
    <div className="bg-[#0b0e14] min-h-screen p-6">
      {/* Back Button */}
      <button 
        onClick={() => router.back()}
        className="mb-6 text-gray-400 hover:text-white flex items-center space-x-2 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeWidth="2"/></svg>
        <span>ກັບຄືນ</span>
      </button>

      {/* Profile Header */}
      <div className="bg-[#161b22] border border-gray-800 rounded-[2rem] p-8 mb-8">
        <div className="flex items-center space-x-6">
          <div className="w-20 h-20 rounded-3xl bg-red-600/10 flex items-center justify-center text-3xl font-black text-red-500 border border-red-500/20">
            {intern?.fullname?.charAt(0) || 'U'}
          </div>
          <div>
            <h1 className="text-3xl font-black text-white uppercase italic tracking-tight">{intern?.fullname}</h1>
            <p className="text-gray-500 font-mono text-sm">{intern?.email}</p>
            <div className="mt-2 inline-block px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold uppercase">
              {intern?.role}
            </div>
          </div>
        </div>
      </div>

      {/* Attendance History Table */}
      <div className="bg-[#161b22] border border-gray-800 rounded-[2rem] overflow-hidden">
        <div className="px-8 py-6 border-b border-gray-800 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Attendance History</h2>
          <span className="text-xs text-gray-500 uppercase font-bold tracking-widest">{records.length} Records</span>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[10px] text-gray-500 uppercase tracking-widest bg-white/5 border-b border-gray-800">
              <th className="px-8 py-4">ວັນທີ</th>
              <th className="px-8 py-4">ເຂົ້າວຽກ</th>
              <th className="px-8 py-4">ອອກວຽກ</th>
              <th className="px-8 py-4">ສະຖານະ</th>
              <th className="px-8 py-4">ໝາຍເຫດ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 text-sm">
            {records.map((rec) => (
              <tr key={rec.id} className="hover:bg-white/5 transition-colors">
                <td className="px-8 py-4 text-gray-300 font-mono">{rec.date}</td>
                <td className="px-8 py-4 text-green-400 font-bold">{rec.checkInTime}</td>
                <td className="px-8 py-4 text-orange-400 font-bold">{rec.checkOutTime || '—'}</td>
                <td className="px-8 py-4">
                  <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                    rec.status === 'Late' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'
                  }`}>
                    {rec.status}
                  </span>
                </td>
                <td className="px-8 py-4">
                  <span className={`text-[10px] font-bold ${rec.workStatus === 'On-Site' ? 'text-blue-400' : 'text-purple-400'}`}>
                    {rec.workStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InternsListPage;