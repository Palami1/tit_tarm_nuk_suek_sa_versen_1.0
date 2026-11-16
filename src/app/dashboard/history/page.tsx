'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { calculateWorkHours, getDerivedAttendanceStatus } from '@/lib/attendance-rules';
import { AttendanceRecord } from '@/types';

export default function HistoryPage() {
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('Intern');
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/login');
        return;
      }

      try {
        const userDoc = await getDocs(query(collection(db, 'users'), where('email', '==', user.email)));
        if (!userDoc.empty) {
          const userData = userDoc.docs[0].data();
          setUserName(userData.fullname || user.displayName || 'Intern');
        }
        await fetchLogs(user.uid);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const fetchLogs = async (uid: string) => {
    try {
      const q = query(
        collection(db, 'attendance'),
        where('userId', '==', uid),
        orderBy('date', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as AttendanceRecord[];

      setLogs(data);
    } catch (err) {
      console.error('Fetch logs error:', err);
    }
  };

  // Compute 3 dedicated statistics according to v2 rules
  const totalDays = logs.length;
  let lateCount = 0;
  let earlyLeaveCount = 0;
  let forgotCheckoutCount = 0;
  let totalHoursSum = 0;
  let completedDaysCount = 0;

  logs.forEach(l => {
    if (l.checkInStatus === 'late') lateCount++;

    const derived = getDerivedAttendanceStatus(l);
    if (derived.checkoutStatus === 'early-leave') earlyLeaveCount++;
    if (derived.checkoutStatus === 'forgot-checkout') forgotCheckoutCount++;

    const hours = calculateWorkHours(l.checkInTime, l.checkOutTime);
    if (hours !== null) {
      totalHoursSum += hours;
      completedDaysCount++;
    }
  });

  const avgHours = completedDaysCount > 0 ? (totalHoursSum / completedDaysCount).toFixed(1) : '0.0';

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString('lo-LA', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6 font-lao animate-slide-up">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">ປະຫວັດການລົງເວລາເຮັດວຽກ</h1>
          <p className="text-xs text-gray-400 mt-0.5">ສະຫຼຸບການມາ, ມາຊ້າ, ອອກກ່ອນເວລາ ແລະ ຊົ່ວໂມງເຮັດວຽກຕົວຈິງ</p>
        </div>
        <div className="flex items-center space-x-3 bg-white p-2 pr-5 rounded-full card-shadow border border-gray-100">
          <img
            className="w-10 h-10 rounded-full border-2 border-red-500 p-0.5"
            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userName}`}
            alt="avatar"
          />
          <div>
            <div className="text-xs font-bold text-gray-800">{userName}</div>
            <div className="text-[10px] text-red-600 font-bold uppercase tracking-wider">LTC Intern</div>
          </div>
        </div>
      </div>

      {/* Stats Cards (4 stats: ວັນທັງໝົດ, ມາຊ້າ, ອອກກ່ອນ, ລືມອອກ) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl card-shadow border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-gray-400">ວັນທີ່ມາທັງໝົດ</span>
            <span className="text-xl">📅</span>
          </div>
          <div className="text-2xl font-black text-gray-900">{totalDays} ມື້</div>
          <div className="text-[10px] text-gray-400 mt-1">ສະເລ່ຍ {avgHours} ຊມ/ມື້</div>
        </div>

        <div className="bg-white p-5 rounded-3xl card-shadow border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-gray-400">ມາຊ້າ (Late)</span>
            <span className="text-xl">🔴</span>
          </div>
          <div className="text-2xl font-black text-red-600">{lateCount} ຄັ້ງ</div>
          <div className="text-[10px] text-gray-400 mt-1">ຫຼັງ 08:00 AM</div>
        </div>

        <div className="bg-white p-5 rounded-3xl card-shadow border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-gray-400">ອອກກ່ອນເວລາ</span>
            <span className="text-xl">🟠</span>
          </div>
          <div className="text-2xl font-black text-amber-600">{earlyLeaveCount} ຄັ້ງ</div>
          <div className="text-[10px] text-gray-400 mt-1">ກ່ອນ 17:00 PM</div>
        </div>

        <div className="bg-white p-5 rounded-3xl card-shadow border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-gray-400">ລືມອອກວຽກ</span>
            <span className="text-xl">⚠️</span>
          </div>
          <div className="text-2xl font-black text-rose-700">{forgotCheckoutCount} ຄັ້ງ</div>
          <div className="text-[10px] text-gray-400 mt-1">ບໍ່ມີ Check-out</div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white rounded-3xl card-shadow border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <h2 className="font-bold text-gray-800 text-sm">ລາຍການລົງເວລາຍ້ອນຫຼັງ</h2>
          <span className="text-xs text-gray-400">1 ຄູ່ຕໍ່ມື້</span>
        </div>

        {loading ? (
          <div className="py-20 text-center text-xs text-gray-400">ກຳລັງດຶງຂໍ້ມູນ...</div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-xs text-gray-400">ຍັງບໍ່ມີປະຫວັດການລົງເວລາ</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] font-bold text-gray-400 uppercase bg-gray-50/50">
                  <th className="py-3 px-6">ວັນທີ</th>
                  <th className="py-3 px-6">ເຂົ້າວຽກ (In)</th>
                  <th className="py-3 px-6">ເລີກວຽກ (Out)</th>
                  <th className="py-3 px-6">ຊົ່ວໂມງເຮັດວຽກ</th>
                  <th className="py-3 px-6">ສະຖານະເລີກວຽກ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {logs.map((log) => {
                  const derived = getDerivedAttendanceStatus(log);
                  const workHours = calculateWorkHours(log.checkInTime, log.checkOutTime);

                  return (
                    <tr key={log.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-4 px-6 font-bold text-gray-900">{log.date}</td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-800">{formatTime(log.checkInTime)}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              log.checkInStatus === 'on-time'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {log.checkInStatus === 'on-time' ? 'ທັນເວລາ' : 'ມາຊ້າ'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6 font-bold text-gray-800">
                        {log.checkOutTime ? formatTime(log.checkOutTime) : '—'}
                      </td>
                      <td className="py-4 px-6">
                        <span className="font-bold text-gray-700">
                          {workHours !== null ? `${workHours} ຊມ` : '—'}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        {derived.checkoutStatus === 'normal' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            ✓ ປົກກະຕິ
                          </span>
                        )}
                        {derived.checkoutStatus === 'early-leave' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            🟠 ອອກກ່ອນເວລາ
                          </span>
                        )}
                        {derived.checkoutStatus === 'forgot-checkout' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            🔴 ລືມ Check-out
                          </span>
                        )}
                        {derived.checkoutStatus === 'working' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                            🔵 ກຳລັງເຮັດວຽກ
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
