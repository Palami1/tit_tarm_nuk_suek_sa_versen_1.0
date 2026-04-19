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
  const [skills, setSkills] = useState<{ name: string; percent: number }[]>([]);
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
        // Safe parser: handles Firestore Timestamp objects AND plain date strings
        const parseDate = (val: any): Date | null => {
          if (!val) return null;
          if (typeof val.toDate === 'function') return val.toDate(); // Firestore Timestamp
          const d = new Date(val);
          return isNaN(d.getTime()) ? null : d;
        };

        const start = parseDate(userData.startDate);
        const end   = parseDate(userData.endDate);
        const today = new Date();

        let totalDays = 0;
        let daysCompleted = 0;
        let percent = 0;

        if (start && end && end > start) {
          const totalDuration = end.getTime() - start.getTime();
          const elapsed = today.getTime() - start.getTime();
          
          const calendarTotalDays = totalDuration / (1000 * 60 * 60 * 24);
          const calendarElapsedDays = elapsed / (1000 * 60 * 60 * 24);
          
          // ກົດລະບຽນໃໝ່: 1 ເດືອນ (30 ມື້) = 20 ມື້ເຮັດວຽກ
          totalDays = Math.round((calendarTotalDays / 30) * 20);
          daysCompleted = Math.max(0, Math.round((calendarElapsedDays / 30) * 20));
          
          if (daysCompleted > totalDays) daysCompleted = totalDays;
          
          percent = totalDays > 0 ? Math.min(100, Math.max(0, Math.round((daysCompleted / totalDays) * 100))) : 0;
        }


        // Calculate unique days attended from attendance collection
        const uniqueDaysSet = new Set<string>();
        attendSnap.docs.forEach(d => {
          const dt = d.data().date;
          if (dt) uniqueDaysSet.add(dt);
        });
        const uniqueAttendedDays = uniqueDaysSet.size;

        // Estimate Hours (Assuming ~7h per unique day, or specific logic)
        const totalHours = uniqueAttendedDays * 7; 
        
        let attendanceRating = 'ກຳລັງປະເມີນ...';
        
        if (daysCompleted > 0) {
           // Calculate performance: attended days vs elapsed days
           const performancePercent = Math.round((uniqueAttendedDays / daysCompleted) * 100);
           
           let grade = 'F (ຕົກ)';
           if (performancePercent >= 80) grade = 'A (ເກັ່ງ)';
           else if (performancePercent >= 70) grade = 'B (ດີ)';
           else if (performancePercent >= 60) grade = 'C (ປານກາງ)';
           else if (performancePercent >= 50) grade = 'D (ອ່ອນ)';
           
           if (daysCompleted < totalDays) {
              attendanceRating = `${grade} (ຊົ່ວຄາວ)`;
           } else {
              attendanceRating = grade;
           }
        }

        setStats({
          daysCompleted,
          totalDays,
          percent,
          attendanceRating,
          totalHours,
          fullname: userData.fullname || 'Intern'
        });
        // Load skills set by admin
        setSkills(Array.isArray(userData.skills) ? userData.skills : []);
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
            <h3 className="font-bold text-gray-800 mb-6">🎯 ທັກສະທີ່ໄດ້ຮຽນຮູ້ (Skills Track)</h3>
            {skills.length === 0 ? (
              <div className="py-10 text-center">
                <div className="text-4xl mb-3">📋</div>
                <p className="text-sm text-gray-400 font-bold">ຍັງບໍ່ທັນຖືກກຳໜົດທັກສະ</p>
                <p className="text-xs text-gray-300 mt-1">Admin ຈະ update ທັກສະໃຫ້ທ່ານໃນໄວໆນີ້</p>
              </div>
            ) : (
              <div className="space-y-6">
                {skills.map((skill, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between text-xs font-bold mb-2">
                      <span className="text-gray-600 uppercase">{skill.name}</span>
                      <span className="text-red-500">{skill.percent}%</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-red-600 to-red-400 h-full rounded-full transition-all duration-1000"
                        style={{ width: `${skill.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
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
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;

