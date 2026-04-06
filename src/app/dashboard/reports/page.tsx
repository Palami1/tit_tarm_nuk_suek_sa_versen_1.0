'use client';

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

const ReportsPage = () => {
  const [stats, setStats] = useState({
    daysCompleted: 0,
    totalDays: 0,
    percent: 0,
    attendanceRating: '...',
    totalHours: 0,
    fullname: 'Intern'
  });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/login');
        return;
      }
      
      try {
        // Fetch User Info for Dates
        const userDoc = await getDocs(query(collection(db, 'users'), where('email', '==', user.email), limit(1)));
        if (userDoc.empty) return;
        const userData = userDoc.docs[0].data();
        
        // Fetch Attendance for Stats
        const attendSnap = await getDocs(query(collection(db, 'attendance'), where('userId', '==', user.uid)));
        const totalSessions = attendSnap.size;
        
        // Calculate Days Progress
        const start = new Date(userData.startDate);
        const end = new Date(userData.endDate);
        const today = new Date();
        const totalDuration = end.getTime() - start.getTime();
        const elapsed = today.getTime() - start.getTime();
        
        const totalDays = Math.ceil(totalDuration / (1000 * 60 * 60 * 24));
        const daysCompleted = Math.max(0, Math.ceil(elapsed / (1000 * 60 * 60 * 24)));
        const percent = Math.min(100, Math.max(0, Math.round((daysCompleted / totalDays) * 100)));

        // Estimate Hours (Assuming 8h per session minus lunch)
        const totalHours = totalSessions * 7; 
        
        setStats({
          daysCompleted,
          totalDays,
          percent,
          attendanceRating: totalSessions > 10 ? 'A+' : 'B',
          totalHours,
          fullname: userData.fullname || 'Intern'
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  if (loading) return <div className="text-center py-20 text-gray-500">ກຳລັງປະມວນຜົນສະຖິຕິ...</div>;

  return (
    <div className="space-y-10 pb-12">
      <div className="mb-10">
        <h1 className="text-3xl font-black text-gray-800">ລາຍງານຜົນການຝຶກງານ</h1>
        <p className="text-gray-400 text-sm mt-1 uppercase tracking-wider font-medium">Internship Progress Summary</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-[2.5rem] p-8 flex items-center justify-between overflow-hidden relative card-shadow border border-gray-100">
            <div className="z-10">
              <h2 className="text-xl font-bold text-gray-800 mb-2">ຄວາມຄືບໜ້າລວມ</h2>
              <p className="text-sm text-gray-400 mb-6">ທ່ານຝຶກງານໄປແລ້ວ {stats.daysCompleted} ມື້ ຈາກທັງໝົດ {stats.totalDays} ມື້</p>
              <div className="flex items-center space-x-2">
                <span className="text-5xl font-black text-red-500">{stats.percent}%</span>
                <span className="text-gray-300 font-bold">COMPLETED</span>
              </div>
            </div>
            <div className="relative w-40 h-40">
              <svg className="w-full h-full" viewBox="0 0 36 36">
                <path className="text-gray-100" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path className="text-red-500" strokeDasharray={`${stats.percent}, 100`} strokeWidth="3" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-black text-gray-800">
                {stats.daysCompleted}/{stats.totalDays}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] p-8 card-shadow border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-6">ທັກສະທີ່ໄດ້ຮຽນຮູ້ (Skills Track)</h3>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs font-bold mb-2">
                  <span className="text-gray-500 uppercase">Network Configuration</span>
                  <span className="text-red-500">80%</span>
                </div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-red-500 h-full transition-all duration-1000" style={{ width: '80%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold mb-2">
                  <span className="text-gray-500 uppercase">Fiber Optic Maintenance</span>
                  <span className="text-red-500">45%</span>
                </div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-red-500 h-full transition-all duration-1000" style={{ width: '45%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold mb-2">
                  <span className="text-gray-500 uppercase">Customer Service</span>
                  <span className="text-red-500">95%</span>
                </div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-red-500 h-full transition-all duration-1000" style={{ width: '95%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gray-900 rounded-[2.5rem] p-8 text-white shadow-xl shadow-gray-200">
            <div className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-widest">Attendance Rating</div>
            <div className="text-5xl font-black mb-2">{stats.attendanceRating}</div>
            <p className="text-xs text-gray-400">ອີງຕາມຈຳນວນຄັ້ງທີ່ທ່ານໄດ້ລົງເວລາເຂົ້າວຽກ</p>
            <div className="mt-6 pt-6 border-t border-gray-800">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Total Hours (Est.)</span>
                <span className="font-bold text-red-500">{stats.totalHours} ຊົ່ວໂມງ</span>
              </div>
            </div>
          </div>

          <button className="w-full bg-white border-2 border-dashed border-gray-700 text-gray-700 py-4 rounded-2xl font-bold text-xs hover:border-red-500 hover:text-red-500 transition-all uppercase">
            ດາວໂຫຼດໃບຢັ້ງຢືນ (Coming Soon)
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;

