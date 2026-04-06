'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';

interface Session {
  id: string;
  date: string;
  checkInTime: string;
  checkOutTime: string | null;
  status: string;
  workStatus?: string;
}

const HistoryPage = () => {
  const [logs, setLogs] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('Intern');
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDocs(query(collection(db, 'users'), where('email', '==', user.email), limit(1)));
        if (!userDoc.empty) {
          const userData = userDoc.docs[0].data();
          setUserName(userData.fullname || user.displayName || 'Intern');
        } else {
          setUserName(user.displayName || 'Intern');
        }
        fetchLogs(user.uid);
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, []);

  // ຄິດໄລ່ Duration (hours) ລະຫວ່າງ checkIn ແລະ checkOut
  const calculateDuration = (checkInTime: string, checkOutTime: string | null): string => {
    if (!checkOutTime) return 'ກຳລັງເຮັດວຽກ';
    const diff = new Date(checkOutTime).getTime() - new Date(checkInTime).getTime();
    const hours = diff / (1000 * 60 * 60);
    // ລົບພັກທ່ຽງ 1 ຊົ່ວໂມງ ຖ້າເຮັດວຽກເກີນ 5 ຊົ່ວໂມງ
    const netHours = hours > 5 ? hours - 1 : hours;
    return netHours.toFixed(1) + ' ຊມ';
  };

  const fetchLogs = async (uid: string) => {
    try {
      const q = query(
        collection(db, 'attendance'),
        where('userId', '==', uid),
        orderBy('checkInTime', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const data: Session[] = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Omit<Session, 'id'>),
      }));
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ສະຖິຕິ
  const totalSessions = logs.length;
  const lateSessions = logs.filter(l => l.status === 'Late').length;

  // ຄິດໄລ່ຊົ່ວໂມງສະເລ່ຍຕໍ່ session (ທີ່ checkout ແລ້ວ)
  const completedSessions = logs.filter(l => l.checkOutTime);
  const avgHoursRaw = completedSessions.length > 0
    ? completedSessions.reduce((sum, l) => {
        const diff = new Date(l.checkOutTime!).getTime() - new Date(l.checkInTime).getTime();
        const hours = diff / (1000 * 60 * 60);
        return sum + (hours > 5 ? hours - 1 : hours);
      }, 0) / completedSessions.length
    : 0;
  const avgHours = avgHoursRaw.toFixed(1);

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('lo-LA', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('lo-LA', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-black text-gray-800">ປະຫວັດການມາເຮັດວຽກ</h1>
        <div className="flex items-center space-x-3 bg-white p-2 pr-6 rounded-full card-shadow border border-gray-100">
          <img
            className="w-10 h-10 rounded-full border-2 border-red-500 p-0.5"
            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userName}`}
            alt="avatar"
          />
          <div>
            <div className="text-xs font-bold text-gray-800">{userName}</div>
            <div className="text-[9px] text-red-500 font-bold uppercase tracking-tighter">LTC Intern</div>
          </div>
        </div>
      </div>

      {/* ສະຖິຕິ Dynamic */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-[2rem] p-6 text-center card-shadow border border-gray-50">
          <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">ລົງເວລາທັງໝົດ</div>
          <div className="text-4xl font-black text-green-500">{totalSessions} <span className="text-sm font-normal text-gray-400">ຄັ້ງ</span></div>
        </div>
        <div className="bg-white rounded-[2rem] p-6 text-center card-shadow border border-gray-50">
          <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">ຊົ່ວໂມງສະເລ່ຍ / session</div>
          <div className="text-4xl font-black text-blue-500">{avgHours} <span className="text-sm font-normal text-gray-400">ຊມ</span></div>
        </div>
        <div className="bg-white rounded-[2rem] p-6 text-center border-l-4 border-red-500 card-shadow">
          <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">ເຂົ້າສາຍ (Late)</div>
          <div className="text-4xl font-black text-red-500">{lateSessions} <span className="text-sm font-normal text-gray-400">ຄັ້ງ</span></div>
        </div>
      </div>

      {/* ລາຍການ */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest pl-2">ລາຍການທັງໝົດ</h2>

        {loading ? (
          <p className="text-center text-gray-400 py-10">ກຳລັງໂຫຼດຂໍ້ມູນ...</p>
        ) : logs.length > 0 ? (
          logs.map((log) => (
            <div
              key={log.id}
              className={`bg-white rounded-3xl p-6 card-shadow border-l-4 ${log.status === 'Late' ? 'border-red-400' : 'border-green-400'}`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center space-x-6">
                  {/* ວັນທີ */}
                  <div className="text-center bg-gray-50 px-4 py-2 rounded-2xl min-w-[80px]">
                    <div className="text-xs font-bold text-gray-400 uppercase">ວັນທີ</div>
                    <div className="text-xl font-black text-gray-800">{new Date(log.checkInTime).getDate()}</div>
                    <div className="text-[10px] text-gray-400">{formatDate(log.checkInTime)}</div>
                  </div>
                  {/* ເວລາ */}
                  <div className="space-y-1">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center text-xs font-bold text-green-600 bg-green-50 px-3 py-1 rounded-lg">
                        ▶ {formatTime(log.checkInTime)}
                      </div>
                      {log.checkOutTime ? (
                        <div className="flex items-center text-xs font-bold text-gray-500 bg-gray-50 px-3 py-1 rounded-lg">
                          ■ {formatTime(log.checkOutTime)}
                        </div>
                      ) : (
                        <div className="text-xs text-orange-500 font-bold animate-pulse">🟠 ກຳລັງເຮັດວຽກ</div>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 italic">
                      ໃຊ້ເວລາ: {calculateDuration(log.checkInTime, log.checkOutTime)}
                    </div>
                  </div>
                </div>
                {/* ສະຖານະ */}
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-tighter ${
                    (log.workStatus || 'On-Site') === 'On-Site'
                      ? 'text-blue-500 bg-blue-50'
                      : 'text-purple-500 bg-purple-50'
                  }`}>
                    {log.workStatus || 'On-Site'}
                  </span>
                  <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-tighter ${
                    log.status === 'Late'
                      ? 'text-red-500 bg-red-50'
                      : 'text-green-500 bg-green-50'
                  }`}>
                    {log.status}
                  </span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-400 py-10">ຍັງບໍ່ມີປະຫວັດການລົງເວລາ</p>
        )}
      </div>
    </div>
  );
};

export default HistoryPage;
