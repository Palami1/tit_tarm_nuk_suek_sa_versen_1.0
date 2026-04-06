'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, getCountFromServer, where, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';

const AdminDashboard = () => {
  const [currentTime, setCurrentTime] = useState('');
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalInterns: 0,
    presentToday: 0,
  });
  const router = useRouter();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/login');
      }
    });

    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: true }));
    }, 1000);

    // Fetch recent activity in real-time
    const q = query(
      collection(db, 'attendance'),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        let timeStr = 'Pending';
        if (data.timestamp?.toDate) {
          timeStr = data.timestamp.toDate().toLocaleTimeString('en-US', { hour12: true });
        } else if (data.checkInTime) {
          timeStr = new Date(data.checkInTime).toLocaleTimeString('en-US', { hour12: true });
        }
        return {
          id: doc.id,
          ...data,
          timeStr
        };
      });
      setRecentActivity(docs);
    });

    // Fetch present today count in real-time
    const today = new Date().toISOString().split('T')[0];
    const qToday = query(
      collection(db, 'attendance'),
      where('date', '==', today),
      where('type', '==', 'check-in')
    );

    const unsubscribeToday = onSnapshot(qToday, (snapshot) => {
      const uniqueUsers = new Set(snapshot.docs.map(doc => doc.data().userId)).size;
      setStats(prev => ({ ...prev, presentToday: uniqueUsers }));
    });

    // Fetch total interns count
    const fetchStats = async () => {
      const qUsers = query(
        collection(db, 'users'),
        where('role', '==', 'intern')
      );
      const snapshot = await getDocs(qUsers);
      setStats(prev => ({ ...prev, totalInterns: snapshot.size }));
    };

    fetchStats();

    return () => {
      clearInterval(timer);
      unsubscribe();
      unsubscribeToday();
      unsubscribeAuth();
    };
  }, []);

  const exportToExcel = () => {
    if (recentActivity.length === 0) {
      alert('ບໍ່ມີຂໍ້ມູນທີ່ຈະອອກລາຍງານ');
      return;
    }

    const reportData = recentActivity.map(item => {
      const dateObj = item.timestamp?.toDate ? item.timestamp.toDate() : new Date(item.checkInTime || Date.now());
      return {
        'ຊື່ ແລະ ນາມສະກຸນ': item.userName || 'Unknown',
        'ID ນັກສຶກສາ': item.userId?.substring(0, 8),
        'ວັນທີ': dateObj.toLocaleDateString('lo-LA'),
        'ເວລາ': dateObj.toLocaleTimeString('lo-LA'),
        'ປະເພດ': item.type === 'check-in' ? 'ເຂົ້າວຽກ' : 'ອອກວຽກ',
        'ສະຖານະ': item.status === 'Late' ? 'ມາສາຍ 🔴' : 'ປົກກະຕິ 🟢',
        'ສະຖານທີ່': item.workStatus || 'On-Site'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(reportData);
    
    // ✅ Add Column Widths for better readability
    const wscols = [
      { wch: 25 }, // ຊື່ ແລະ ນາມສະກຸນ
      { wch: 15 }, // ID ນັກສຶກສາ
      { wch: 15 }, // ວັນທີ
      { wch: 15 }, // ເວລາ
      { wch: 15 }, // ປະເພດ
      { wch: 20 }, // ສະຖານະ
      { wch: 15 }  // ສະຖານທີ່
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance_Report");
    
    // ✅ Dynamic Filename with Date
    const fileName = `LTC_Attendance_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div>
      <div className="flex justify-between items-end mb-12">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white uppercase italic">Overview</h1>
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] mt-2">LTC Attendance Intelligence</p>
        </div>
        <div className="flex items-center space-x-6">
          <div className="text-right">
            <div className="text-lg font-mono font-bold text-white">{currentTime}</div>
            <div className="text-[9px] font-bold text-green-500 uppercase tracking-tighter">System Live</div>
          </div>
          <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center shadow-[0_0_15px_rgba(225,29,72,0.15)]">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeWidth="2"></path>
            </svg>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-[#161b22] border border-gray-800 rounded-[2rem] p-8 flex flex-col justify-between min-h-[160px] hover:border-red-500 transition-all">
          <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Total Interns</span>
          <div className="flex items-baseline space-x-2">
            <span className="text-6xl font-black text-white">{stats.totalInterns}</span>
            <span className="text-xs text-green-500">+4 ອາທິດນີ້</span>
          </div>
        </div>
        <div className="bg-red-600/5 border border-red-500 shadow-[0_0_15px_rgba(225,29,72,0.15)] rounded-[2rem] p-8 flex flex-col justify-between min-h-[160px]">
          <span className="text-[10px] text-red-500 font-black uppercase tracking-widest">Present Today</span>
          <div className="text-6xl font-black text-red-500">{stats.presentToday}</div>
        </div>
        <div className="bg-[#161b22] border border-gray-800 rounded-[2rem] p-8 flex justify-between items-center min-h-[160px] hover:border-red-500 transition-all">
          <div>
            <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Server Status</span>
            <div className="text-2xl font-black text-white mt-2">OPTIMAL</div>
            <div className="text-[9px] text-green-500 mt-1 uppercase">Ping: 12ms</div>
          </div>
          <div className="text-gray-800">
            <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3C7.58 3 4 4.79 4 7s3.58 4 8 4 8-1.79 8-4-3.58-4-8-4M4 9v3c0 2.21 3.58 4 8 4s8-1.79 8-4V9c0 2.21-3.58 4-8 4s-8-1.79-8-4m0 5v3c0 2.21 3.58 4 8 4s8-1.79 8-4v-3c0 2.21-3.58 4-8 4s-8-1.79-8-4z"></path>
            </svg>
          </div>
        </div>
      </div>

      <div className="bg-[#161b22] border border-gray-800 rounded-[2rem] overflow-hidden">
        <div className="px-8 py-6 border-b border-gray-800 bg-white/5 flex justify-between items-center">
          <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">ລາຍຊື່ຜູ້ເຂົ້າວຽກຫຼ້າສຸດ</h2>
          <div className="flex items-center space-x-3">
            <button 
              onClick={exportToExcel}
              className="text-[10px] bg-green-600/10 text-green-500 border border-green-500/20 px-3 py-1.5 rounded-lg font-bold hover:bg-green-600 hover:text-white transition-all flex items-center space-x-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Export Excel</span>
            </button>
            <button className="text-xs text-red-500 font-bold hover:underline">View All</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] text-gray-500 uppercase tracking-widest border-b border-gray-800">
                <th className="px-8 py-5">Intern Information</th>
                <th className="px-8 py-5 text-center">Time Session</th>
                <th className="px-8 py-5 text-right">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {recentActivity.map((activity) => (
                <tr key={activity.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center font-bold text-red-500">
                        {activity.userName?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-200">{activity.userName}</div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-tighter">ID: {activity.userId?.substring(0, 8)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center justify-center space-x-4 text-[11px] font-mono">
                      <span className="text-green-500 font-bold">{activity.timeStr}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <span className={`text-[10px] px-3 py-1 rounded-full font-bold uppercase ${
                      activity.type === 'check-in' 
                        ? 'bg-green-500/10 text-green-500 border border-green-500/20' 
                        : 'bg-red-500/10 text-red-500 border border-red-500/20'
                    }`}>
                      {activity.type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
