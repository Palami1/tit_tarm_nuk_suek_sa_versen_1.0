'use client';

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import {
  calculateTotalWorkDays,
  calculateDaysPassed,
  DateRange,
} from '@/lib/workdays';
import {
  calculateAttendancePerformance,
  getGradeDetails,
  getGradeStatus,
  DEFAULT_GRADE_THRESHOLDS,
} from '@/lib/grading';
import { getVientianeDateString, getServerNow } from '@/lib/attendance-rules';
import { Skill, UserProfile } from '@/types';

export default function InternReportsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Computed Stats
  const [stats, setStats] = useState({
    totalWorkDays: 0,
    daysPassed: 0,
    attendedDays: 0,
    absentDays: 0,
    leaveDays: 0,
    performancePercent: null as number | null,
    grade: '—',
    gradeLabel: 'ກຳລັງປະເມີນ...',
    gradeColorClass: 'text-gray-400 bg-gray-500/10',
    isFinal: false,
  });

  const [skills, setSkills] = useState<Skill[]>([]);
  const router = useRouter();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/login');
        return;
      }

      try {
        setLoading(true);

        // 1. Fetch User Profile
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (!userSnap.exists()) return;
        const userData = { uid: userSnap.id, ...userSnap.data() } as UserProfile;
        setProfile(userData);
        setSkills(userData.skills || []);

        // 2. Fetch System Holidays
        const holidaysSnap = await getDocs(collection(db, 'holidays'));
        const holidaysList = holidaysSnap.docs.map(d => d.id); // Doc ID is YYYY-MM-DD

        // 3. Fetch Approved Leave Requests
        const leaveSnap = await getDocs(
          query(
            collection(db, 'leave_requests'),
            where('userId', '==', user.uid),
            where('status', '==', 'approved')
          )
        );
        const approvedLeaves: DateRange[] = leaveSnap.docs.map(d => ({
          startDate: d.data().startDate,
          endDate: d.data().endDate,
        }));

        // 4. Fetch Attendance Records for this intern
        const attendSnap = await getDocs(
          query(collection(db, 'attendance'), where('userId', '==', user.uid))
        );
        const uniqueAttendedDates = new Set<string>();
        attendSnap.docs.forEach(d => {
          const dt = d.data().date;
          if (dt) uniqueAttendedDates.add(dt);
        });
        const attendedDaysCount = uniqueAttendedDates.size;

        // 5. Calendar calculations using v2 pure functions
        const startDate = userData.startDate || '';
        const endDate = userData.endDate || '';
        const todayStr = getVientianeDateString(getServerNow());

        if (startDate && endDate) {
          const totalWork = calculateTotalWorkDays(startDate, endDate, holidaysList, approvedLeaves);
          const passed = calculateDaysPassed(startDate, endDate, todayStr, holidaysList, approvedLeaves);
          const perf = calculateAttendancePerformance(attendedDaysCount, passed);
          const isFinal = getGradeStatus(todayStr, endDate) === 'final';

          // Load system grade thresholds if available
          let thresholds = DEFAULT_GRADE_THRESHOLDS;
          try {
            const sSnap = await getDoc(doc(db, 'settings', 'system'));
            if (sSnap.exists() && sSnap.data()?.gradeThresholds) {
              thresholds = sSnap.data().gradeThresholds;
            }
          } catch (e) {}

          const gradeInfo = getGradeDetails(perf, isFinal, thresholds);
          const absent = Math.max(0, passed - attendedDaysCount);

          // Count unique leave days that fell within the internship period
          let leaveCount = 0;
          approvedLeaves.forEach(l => {
            const days = calculateTotalWorkDays(l.startDate, l.endDate, holidaysList, []);
            leaveCount += days;
          });

          setStats({
            totalWorkDays: totalWork,
            daysPassed: passed,
            attendedDays: attendedDaysCount,
            absentDays: absent,
            leaveDays: leaveCount,
            performancePercent: perf,
            grade: gradeInfo.grade,
            gradeLabel: gradeInfo.label,
            gradeColorClass: gradeInfo.colorClass,
            isFinal,
          });
        }
      } catch (err) {
        console.error('Error fetching reports data:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [router]);

  return (
    <div className="space-y-6 font-lao animate-slide-up">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">ລາຍງານຜົນ & ການປະເມີນ</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            ຄິດໄລ່ຈາກມື້ເຮັດວຽກຕົວຈິງ (ຈັນ–ສຸກ, ຕັດວັນພັກ ແລະ ມື້ລາພັກທີ່ອະນຸມັດແລ້ວ)
          </p>
        </div>
        <div className="flex items-center space-x-3 bg-white p-2 pr-5 rounded-full card-shadow border border-gray-100">
          <img
            className="w-10 h-10 rounded-full border-2 border-red-500 p-0.5"
            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.fullname || 'Intern'}`}
            alt="avatar"
          />
          <div>
            <div className="text-xs font-bold text-gray-800">{profile?.fullname || 'Intern'}</div>
            <div className="text-[10px] text-red-600 font-bold uppercase tracking-wider">LTC Intern</div>
          </div>
        </div>
      </div>

      {/* Main Grade & Performance Banner */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 card-shadow border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center md:text-left flex-1">
          <div className="inline-flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              ເກຣດປະເມີນຜົນການຝຶກງານ
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${stats.gradeColorClass}`}>
              {stats.isFinal ? 'ສຸດທ້າຍ (Final)' : 'ຊົ່ວຄາວ (Provisional)'}
            </span>
          </div>

          <div className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight flex items-baseline justify-center md:justify-start gap-3">
            <span>ເກຣດ {stats.grade}</span>
            {stats.performancePercent !== null && (
              <span className="text-2xl sm:text-3xl font-bold text-gray-400">
                ({stats.performancePercent}%)
              </span>
            )}
          </div>

          <p className="text-xs text-gray-500 leading-relaxed max-w-lg">
            {stats.gradeLabel}. ເກຣດຄິດໄລ່ຈາກອັດຕາສ່ວນການມາເຮັດວຽກຕົວຈິງ ທຽບກັບມື້ເຮັດວຽກທີ່ຜ່ານມາ (ບໍ່ນັບວັນພັກ ແລະ ມື້ລາພັກ).
          </p>
        </div>

        {/* Big Circular/Square Badge */}
        <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-red-600 to-rose-700 flex flex-col items-center justify-center text-white shadow-xl shadow-red-200">
          <span className="text-4xl font-black leading-none">{stats.grade}</span>
          <span className="text-[10px] font-bold uppercase tracking-widest mt-1 opacity-80">
            {stats.isFinal ? 'FINAL' : 'TEMP'}
          </span>
        </div>
      </section>

      {/* 4 Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl card-shadow border border-gray-100">
          <div className="text-xs font-bold text-gray-400 mb-1">ມື້ທີ່ມາເຮັດວຽກ</div>
          <div className="text-2xl font-black text-emerald-600">{stats.attendedDays} ມື້</div>
          <div className="text-[10px] text-gray-400 mt-1">ມີ Check-in ຕົວຈິງ</div>
        </div>

        <div className="bg-white p-5 rounded-3xl card-shadow border border-gray-100">
          <div className="text-xs font-bold text-gray-400 mb-1">ມື້ເຮັດວຽກທີ່ຜ່ານມາ</div>
          <div className="text-2xl font-black text-gray-800">{stats.daysPassed} ມື້</div>
          <div className="text-[10px] text-gray-400 mt-1">ບໍ່ລວມມື້ລາ ແລະ ວັນພັກ</div>
        </div>

        <div className="bg-white p-5 rounded-3xl card-shadow border border-gray-100">
          <div className="text-xs font-bold text-gray-400 mb-1">ມື້ຂາດວຽກ (Absent)</div>
          <div className="text-2xl font-black text-red-600">{stats.absentDays} ມື້</div>
          <div className="text-[10px] text-gray-400 mt-1">ຜ່ານມາໂດຍບໍ່ໄດ້ມາ</div>
        </div>

        <div className="bg-white p-5 rounded-3xl card-shadow border border-gray-100">
          <div className="text-xs font-bold text-gray-400 mb-1">ມື້ເຮັດວຽກທັງໝົດ</div>
          <div className="text-2xl font-black text-gray-800">{stats.totalWorkDays} ມື້</div>
          <div className="text-[10px] text-gray-400 mt-1">ຕະຫຼອດຊ່ວງຝຶກງານ</div>
        </div>
      </div>

      {/* Progress Bar of Internship */}
      <section className="bg-white rounded-3xl p-6 card-shadow border border-gray-100 space-y-3">
        <div className="flex justify-between items-center text-xs">
          <span className="font-bold text-gray-700">ຄວາມຄືບໜ້າໄລຍະເວລາຝຶກງານ:</span>
          <span className="font-extrabold text-red-600">
            {stats.totalWorkDays > 0 ? Math.min(100, Math.round((stats.daysPassed / stats.totalWorkDays) * 100)) : 0}%
          </span>
        </div>

        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-red-500 to-rose-600 h-3 rounded-full transition-all duration-500"
            style={{
              width: `${stats.totalWorkDays > 0 ? Math.min(100, Math.round((stats.daysPassed / stats.totalWorkDays) * 100)) : 0}%`,
            }}
          />
        </div>

        <div className="flex justify-between text-[11px] text-gray-400 pt-1">
          <span>ວັນເລີ່ມຕົ້ນ: {profile?.startDate || '—'}</span>
          <span>{stats.daysPassed} ຈາກ {stats.totalWorkDays} ມື້</span>
          <span>ວັນສິ້ນສຸດ: {profile?.endDate || '—'}</span>
        </div>
      </section>

      {/* Skills Evaluation Section */}
      <section className="bg-white rounded-3xl p-6 card-shadow border border-gray-100 space-y-4">
        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <span>🎯</span>
              <span>ຄະແນນທັກສະ (Skills Evaluation)</span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">ປະເມີນ ແລະ ໃຫ້ຄະແນນໂດຍຫົວໜ້າທີມ (Supervisor)</p>
          </div>
          <span className="text-xs text-gray-400">{skills.length} ທັກສະ</span>
        </div>

        {skills.length === 0 ? (
          <div className="py-10 text-center text-xs text-gray-400">
            ຍັງບໍ່ມີການປະເມີນທັກສະຈາກຫົວໜ້າທີມ
          </div>
        ) : (
          <div className="space-y-4">
            {skills.map((skill, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-gray-800">{skill.name}</span>
                  <span className="font-extrabold text-red-600">{skill.percent}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-red-500 h-2.5 rounded-full"
                    style={{ width: `${skill.percent}%` }}
                  />
                </div>
                {skill.note && (
                  <p className="text-[11px] text-gray-500 italic pl-1">ຄຳເຫັນ: {skill.note}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
