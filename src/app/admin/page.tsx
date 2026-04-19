'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, getCountFromServer, where, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';

const AdminDashboard = () => {
  const [currentTime, setCurrentTime] = useState('');
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
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

    // Fetch attendance based on selected date or recent
    let q = query(
      collection(db, 'attendance'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );

    if (selectedDate) {
      q = query(
        collection(db, 'attendance'),
        where('date', '==', selectedDate)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        let timeStr = '--:--';
        if (data.timestamp?.toDate) {
          timeStr = data.timestamp.toDate().toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
          });
        }
        return {
          id: doc.id,
          ...data,
          timeStr
        };
      });
      setRecentActivity(docs);
    }, (error) => {
      console.error("Attendance listener error:", error);
    });

    // Fetch present today count
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
      try {
        const qUsers = query(
          collection(db, 'users'),
          where('role', '==', 'intern')
        );
        const snapshot = await getDocs(qUsers);
        setStats(prev => ({ ...prev, totalInterns: snapshot.size }));
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };

    fetchStats();

    return () => {
      clearInterval(timer);
      unsubscribe();
      unsubscribeToday();
      unsubscribeAuth();
    };
  }, [selectedDate, router]);

  // Format a ISO/Date value to HH:MM AM/PM string
  const fmtTime = (t: any): string => {
    if (!t) return '--:--';
    try {
      const d = typeof t === 'string' ? new Date(t) : t.toDate ? t.toDate() : new Date(t);
      if (isNaN(d.getTime())) return '--:--';
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch { return '--:--'; }
  };

  // Helper: check if a Date/ISO value is after 08:00
  const isAfter8 = (t: any): boolean => {
    if (!t) return false;
    try {
      const d = typeof t === 'string' ? new Date(t) : t.toDate ? t.toDate() : new Date(t);
      return d.getHours() > 8 || (d.getHours() === 8 && d.getMinutes() > 0);
    } catch { return false; }
  };

  // Helper: check if checkout is before 17:00 (early leave)
  const isBefore5PM = (t: any): boolean => {
    if (!t) return false;
    try {
      const d = typeof t === 'string' ? new Date(t) : t.toDate ? t.toDate() : new Date(t);
      return d.getHours() < 17;
    } catch { return false; }
  };

  // Group activity by User+Date. Each Firestore doc has checkInTime & checkOutTime on the SAME record.
  const groupedData = React.useMemo(() => {
    const groups: Record<string, any> = {};

    recentActivity.forEach(activity => {
      const key = `${activity.date}_${activity.userId}`;
      if (!groups[key]) {
        groups[key] = {
          userId: activity.userId,
          userName: activity.userName,
          date: activity.date,
          sessions: [],
          status: activity.status || 'On-time',
          workStatus: activity.workStatus || 'On-Site'
        };
      }
      // Accumulate all session documents for this user+date
      groups[key].sessions.push(activity);
      if (activity.status === 'Late') {
        groups[key].status = 'Late';
      }
    });

    // For each group, sort sessions by checkInTime and derive display fields
    return Object.values(groups)
      .map((g: any) => {
        const sorted = [...g.sessions].sort((a: any, b: any) => {
          const ta = a.checkInTime ? new Date(a.checkInTime).getTime() : (a.timestamp?.seconds || 0) * 1000;
          const tb = b.checkInTime ? new Date(b.checkInTime).getTime() : (b.timestamp?.seconds || 0) * 1000;
          return ta - tb;
        });

        const s1 = sorted[0];
        const s2 = sorted[1];

        return {
          ...g,
          checkIn1: fmtTime(s1?.checkInTime),
          checkOut1: fmtTime(s1?.checkOutTime),
          checkIn2: fmtTime(s2?.checkInTime),
          checkOut2: fmtTime(s2?.checkOutTime),
          checkIn1Late: isAfter8(s1?.checkInTime),
          checkIn2Late: isAfter8(s2?.checkInTime),
          checkOut1Early: s1?.checkOutTime ? isBefore5PM(s1.checkOutTime) : false,
          checkOut2Early: s2?.checkOutTime ? isBefore5PM(s2.checkOutTime) : false,
        };
      })
      .filter(item => item.userName?.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [recentActivity, searchTerm]);

  const exportToExcel = () => {
    if (groupedData.length === 0) {
      alert('ບໍ່ມີຂໍ້ມູນທີ່ຈະອອກລາຍງານ');
      return;
    }

    const reportData = groupedData.map(item => ({
      'ວັນທີ': item.date,
      'ຊື່ ແລະ ນາມສະກຸນ': item.userName,
      'ID ນັກສຶກສາ': item.userId?.substring(0, 8),
      'ເຂົ້າເຊົ້າ': item.checkIn1,
      'ອອກເຊົ້າ': item.checkOut1,
      'ເຂົ້າແລງ': item.checkIn2,
      'ອອກແລງ': item.checkOut2,
      'ສະຖານະ': item.status === 'Late' ? 'ມາສາຍ' : 'ປົກກະຕິ',
      'ສະຖານທີ່': item.workStatus
    }));

    const worksheet = XLSX.utils.json_to_sheet(reportData);
    const wscols = [
      { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");
    XLSX.writeFile(workbook, `Attendance_${selectedDate || 'Recent'}.xlsx`);
  };

  return (
      <div className="pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white uppercase italic">ລະບົບຕິດຕາມ</h1>
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] mt-2">ແຜງຄວບຄຸມການລົງເວລາ • Attendance Control Panel</p>
        </div>
        <div className="flex items-center space-x-6">
          <div className="text-right hidden sm:block">
            <div className="text-xl font-mono font-bold text-white leading-none">{currentTime}</div>
            <div className="text-[9px] font-bold text-red-500 uppercase tracking-widest mt-1">ສົດໆ Live Feed</div>
          </div>
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-lg border border-red-500/20 overflow-hidden">
            <img 
              src="https://ltc.laotel.com/BBLogo/LTC%20logo%20sign.png" 
              alt="LTC Logo"
              className="h-8 w-auto object-contain"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <Link href="/admin/interns" className="bg-[#161b22] border border-gray-800 rounded-[2rem] p-8 flex flex-col justify-between hover:border-red-500/50 transition-all group cursor-pointer">
          <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">ນັກສຶກສາທັງໝົດ</span>
          <div className="flex items-baseline space-x-2 mt-4">
            <span className="text-6xl font-black text-white group-hover:text-red-500 transition-colors uppercase">{stats.totalInterns}</span>
            <span className="text-xs text-green-500 font-bold uppercase">ເບິ່ງທັງໝົດ</span>
          </div>
        </Link>
        <div className="bg-red-600/5 border border-red-500 shadow-[0_0_20px_rgba(225,29,72,0.1)] rounded-[2rem] p-8 flex flex-col justify-between">
          <span className="text-[10px] text-red-500 font-black uppercase tracking-widest">ລົງເວລາມື້ນີ້</span>
          <div className="text-6xl font-black text-red-500 mt-4">{stats.presentToday}</div>
        </div>
        <Link href="/admin/reports" className="bg-[#161b22] border border-gray-800 rounded-[2rem] p-8 flex justify-between items-center hover:border-red-500 transition-all group cursor-pointer">
          <div>
            <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">ຂໍ້ມູນລາຍງານ</span>
            <div className="text-2xl font-black text-white mt-2 uppercase italic">ປົກກະຕິ</div>
            <div className="text-[9px] text-green-400 mt-1 font-bold uppercase tracking-tighter flex items-center">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse"></span>
              ເບິ່ງລາຍງານທັງໝົດ
            </div>
          </div>
          <div className="text-gray-800 group-hover:text-red-500 transition-colors">
            <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3C7.58 3 4 4.79 4 7s3.58 4 8 4 8-1.79 8-4-3.58-4-8-4M4 9v3c0 2.21 3.58 4 8 4s8-1.79 8-4V9c0 2.21-3.58 4-8 4s-8-1.79-8-4m0 5v3c0 2.21 3.58 4 8 4s8-1.79 8-4v-3c0 2.21-3.58 4-8 4s-8-1.79-8-4z"></path>
            </svg>
          </div>
        </Link>
      </div>

      <div className="bg-[#161b22] border border-gray-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="px-8 py-8 border-b border-gray-800 bg-white/[0.02] flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex items-center space-x-3">
              <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] flex items-center">
                <span className="w-2 h-2 bg-red-600 rounded-full mr-3"></span>
                ຕາຕະລາງລົງເວລາ
              </h2>
              <Link href="/admin/interns" className="text-[9px] font-black text-red-500 hover:text-white transition-colors uppercase decoration-red-500/50 underline-offset-4 hover:underline">ເບິ່ງທຸກຄົນ</Link>
            </div>
            <p className="text-[10px] text-gray-600 font-bold mt-1 uppercase tracking-widest">ລາຍລະອຽດການເຂົ້າ-ອອກວຽກ • ສີແດງ = ມາສາຍ (ຫຼັງ 08:00)</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
            <div className="relative flex-grow lg:flex-grow-0">
              <input 
                type="text" 
                placeholder="ຄົ້ນຫາຊື່ນັກສຶກສາ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-[#0d1117] border border-gray-800 text-gray-300 text-[10px] font-bold rounded-xl px-4 py-3 w-full lg:w-64 focus:outline-none focus:border-red-500 transition-all placeholder:text-gray-700"
              />
              <svg className="w-4 h-4 absolute right-4 top-3 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            
            <input 
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-[#0d1117] border border-gray-800 text-gray-300 text-[10px] font-bold rounded-xl px-4 py-3 focus:outline-none focus:border-red-500 transition-all"
            />

            <button 
              onClick={exportToExcel}
              className="bg-white text-black px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-lg"
            >
              ອອກ Excel
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[9px] text-gray-500 uppercase tracking-[0.2em] font-black border-b border-gray-800 bg-gray-900/40">
                <th className="px-8 py-5">ຊື່ນັກສຶກສາ</th>
                <th className="px-4 py-5 font-bold text-center">ວັນທີ</th>
                <th className="px-4 py-5 text-center border-x border-gray-800/50">
                  ຮອບເຊົ້າ
                  <span className="block text-[7px] text-gray-700 font-bold normal-case tracking-normal mt-0.5">(ກ່ອນ 08:00 = ປົກກະຕິ)</span>
                </th>
                <th className="px-4 py-5 text-center">ຮອບບ່າຍ</th>
                <th className="px-4 py-5 text-center">ສະຖານະ</th>
                <th className="px-8 py-5 text-right">ສະຖານທີ</th>
              </tr>
              <tr className="text-[8px] text-gray-600 uppercase tracking-widest border-b border-gray-800">
                <th className="px-8"></th>
                <th className="px-4"></th>
                <th className="px-4 py-1 text-center border-x border-gray-800/50">
                  <div className="flex items-center justify-center gap-6">
                    <span className="text-green-700">ເຂົ້າ ▲</span>
                    <span className="text-red-900">ອອກ ▼</span>
                  </div>
                </th>
                <th className="px-4 py-1 text-center">
                  <div className="flex items-center justify-center gap-6">
                    <span className="text-green-700">ເຂົ້າ ▲</span>
                    <span className="text-red-900">ອອກ ▼</span>
                  </div>
                </th>
                <th colSpan={2}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {groupedData.length > 0 ? groupedData.map((item) => (
                <tr key={`${item.date}_${item.userId}`} className={`hover:bg-red-600/[0.02] transition-colors group ${(item.checkIn1Late || item.checkIn2Late) ? 'bg-red-950/10' : ''}`}>
                  <td className="px-8 py-5">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-2xl bg-gray-800 border border-gray-700 flex items-center justify-center font-black text-red-500 text-lg shadow-inner group-hover:border-red-500/30 transition-all">
                        {item.userName?.charAt(0) || 'U'}
                      </div>
                      <Link href={`/admin/interns/${item.userId}`} className="block group/name">
                        <div className="text-[13px] font-black text-gray-100 uppercase tracking-tight group-hover/name:text-red-500 transition-colors">{item.userName}</div>
                        <div className="text-[8px] text-gray-600 font-bold uppercase tracking-widest">ລະຫັດ: {item.userId?.substring(0, 8)}</div>
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-5 text-center">
                    <span className="text-[11px] font-mono font-bold text-gray-400">{item.date}</span>
                  </td>

                  {/* Morning session */}
                  <td className="px-4 py-5 text-center border-x border-gray-800/50">
                    <div className="flex items-center justify-center gap-4 font-mono font-bold text-xs">
                      {/* Check-in 1 */}
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`font-mono font-black text-sm ${
                          item.checkIn1 === '--:--'
                            ? 'text-gray-800'
                            : item.checkIn1Late
                              ? 'text-red-500'
                              : 'text-green-400'
                        }`}>
                          {item.checkIn1}
                        </span>
                        {item.checkIn1Late && item.checkIn1 !== '--:--' && (
                          <span className="text-[7px] font-black text-red-500 bg-red-500/10 border border-red-500/20 px-1 rounded uppercase tracking-wider">ສາຍ</span>
                        )}
                      </div>
                      <span className="text-gray-800 text-xs">→</span>
                      {/* Check-out 1 */}
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`font-mono font-black text-sm ${
                          item.checkOut1 === '--:--'
                            ? 'text-gray-800'
                            : item.checkOut1Early
                              ? 'text-red-500'
                              : 'text-orange-400'
                        }`}>
                          {item.checkOut1}
                        </span>
                        {item.checkOut1Early && item.checkOut1 !== '--:--' && (
                          <span className="text-[7px] font-black text-red-500 bg-red-500/10 border border-red-500/20 px-1 rounded uppercase tracking-wider">ອອກກ່ອນ</span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Afternoon session */}
                  <td className="px-4 py-5 text-center">
                    <div className="flex items-center justify-center gap-4 font-mono font-bold text-xs">
                      {/* Check-in 2 */}
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`font-mono font-black text-sm ${
                          item.checkIn2 === '--:--'
                            ? 'text-gray-800'
                            : item.checkIn2Late
                              ? 'text-red-500'
                              : 'text-green-400'
                        }`}>
                          {item.checkIn2}
                        </span>
                        {item.checkIn2Late && item.checkIn2 !== '--:--' && (
                          <span className="text-[7px] font-black text-red-500 bg-red-500/10 border border-red-500/20 px-1 rounded uppercase tracking-wider">ສາຍ</span>
                        )}
                      </div>
                      <span className="text-gray-800 text-xs">→</span>
                      {/* Check-out 2 */}
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`font-mono font-black text-sm ${
                          item.checkOut2 === '--:--'
                            ? 'text-gray-800'
                            : item.checkOut2Early
                              ? 'text-red-500'
                              : 'text-orange-400'
                        }`}>
                          {item.checkOut2}
                        </span>
                        {item.checkOut2Early && item.checkOut2 !== '--:--' && (
                          <span className="text-[7px] font-black text-red-500 bg-red-500/10 border border-red-500/20 px-1 rounded uppercase tracking-wider">ອອກກ່ອນ</span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-5 text-center">
                    <span className={`text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-tighter ${
                      item.status === 'On-time'
                        ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                        : 'bg-red-500/10 text-red-500 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]'
                    }`}>
                      {item.status === 'On-time' ? 'ທັນເວລາ' : 'ມາສາຍ'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end space-x-2">
                       <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                       <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                         {item.workStatus === 'On-Site' ? 'ໃນສະຖານທີ' : item.workStatus}
                       </span>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mb-4 border border-gray-700">
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">ຍັງບໍ່ມີຂໍ້ມູນລົງເວລາໃນຊ່ວງນີ້</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
