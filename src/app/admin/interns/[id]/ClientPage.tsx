'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import Link from 'next/link';
import { UserProfile, AttendanceRecord, DailyReport, Holiday, LeaveRequest, Skill, FinalGrade } from '@/types';
import { calculateWorkHours, isForgotCheckout, getServerNow, getVientianeDateString } from '@/lib/attendance-rules';
import { calculateAttendancePerformance, determineGrade } from '@/lib/grading';
import { calculateTotalWorkDays, calculateDaysPassed, DateRange } from '@/lib/workdays';

const VALID_GRADES = ['A', 'B', 'C', 'D', 'F'];

export default function InternDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const [currentAdmin, setCurrentAdmin] = useState<UserProfile | null>(null);
  const [intern, setIntern] = useState<UserProfile | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  // Skills saving states
  const [skillsSaving, setSkillsSaving] = useState(false);
  const [skillsMessage, setSkillsMessage] = useState<string | null>(null);

  // Grade proposal states
  const [selectedGrade, setSelectedGrade] = useState<string>('A');
  const [proposedNote, setProposedNote] = useState<string>('');
  const [gradeSubmitting, setGradeSubmitting] = useState(false);
  const [gradeMessage, setGradeMessage] = useState<string | null>(null);

  // Inline Report Review state
  const [activeReviewReportId, setActiveReviewReportId] = useState<string | null>(null);
  const [reportComment, setReportComment] = useState('');
  const [reportReviewStatus, setReportReviewStatus] = useState<'approved' | 'needs-revision'>('approved');
  const [reportReviewSubmitting, setReportReviewSubmitting] = useState(false);

  useEffect(() => {
    let unsubscribeAttendance: (() => void) | undefined;
    let unsubscribeReports: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/login');
        return;
      }

      if (!id) return;

      try {
        // 1. Fetch current logged-in user profile
        const adminDocRef = doc(db, 'users', user.uid);
        const adminDocSnap = await getDoc(adminDocRef);

        if (!adminDocSnap.exists()) {
          router.replace('/login');
          return;
        }

        const adminData = { uid: adminDocSnap.id, ...adminDocSnap.data() } as UserProfile;
        setCurrentAdmin(adminData);

        if (adminData.role !== 'admin' && adminData.role !== 'superadmin') {
          router.replace('/dashboard');
          return;
        }

        // 2. Fetch target intern
        const internDocRef = doc(db, 'users', id);
        const internDocSnap = await getDoc(internDocRef);

        if (!internDocSnap.exists()) {
          setLoading(false);
          return;
        }

        const internData = { uid: internDocSnap.id, ...internDocSnap.data() } as UserProfile;
        setIntern(internData);

        // Guard: admin only allowed to see interns of their team
        if (adminData.role === 'admin' && internData.supervisorId !== user.uid) {
          setUnauthorized(true);
          setLoading(false);
          return;
        }

        // Initialize state from intern data
        setSkills(Array.isArray(internData.skills) ? internData.skills : []);
        if (internData.finalGrade?.grade) {
          setSelectedGrade(internData.finalGrade.grade);
          setProposedNote(internData.finalGrade.proposedNote || '');
        }

        // 3. Fetch Holidays
        const holSnap = await getDocs(collection(db, 'holidays'));
        setHolidays(holSnap.docs.map(d => ({ date: d.id, ...d.data() } as Holiday)));

        // 4. Fetch Approved Leaves for this intern
        const qLeaves = query(
          collection(db, 'leave_requests'),
          where('userId', '==', id),
          where('status', '==', 'approved')
        );
        const leavesSnap = await getDocs(qLeaves);
        setLeaves(leavesSnap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)));

        // 5. Fetch Attendance real-time
        const qAttendance = query(
          collection(db, 'attendance'),
          where('userId', '==', id)
        );
        unsubscribeAttendance = onSnapshot(qAttendance, (snap) => {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));
          docs.sort((a, b) => b.date.localeCompare(a.date));
          setAttendance(docs);
        }, (err) => console.error('Attendance error:', err));

        // 6. Fetch Reports real-time
        const qReports = query(
          collection(db, 'daily_reports'),
          where('userId', '==', id)
        );
        unsubscribeReports = onSnapshot(qReports, (snap) => {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as DailyReport));
          docs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          setReports(docs);
          setLoading(false);
        }, (err) => {
          console.error('Reports error:', err);
          setLoading(false);
        });

      } catch (err) {
        console.error('Intern details load error:', err);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeAttendance) unsubscribeAttendance();
      if (unsubscribeReports) unsubscribeReports();
    };
  }, [id, router]);

  // Real-time Attendance & Provisional Grade Calculation
  const performanceStats = useMemo(() => {
    if (!intern?.startDate || !intern?.endDate) return null;

    const holidayDates = holidays.map(h => h.date);
    const leaveRanges: DateRange[] = leaves.map(l => ({ startDate: l.startDate, endDate: l.endDate }));
    const attendedDates = new Set(attendance.filter(a => !!a.checkInTime).map(a => a.date));
    const attendedDaysCount = attendedDates.size;

    const todayStr = getVientianeDateString(getServerNow());
    const totalWorkdays = calculateTotalWorkDays(intern.startDate, intern.endDate, holidayDates, leaveRanges);
    const daysPassed = calculateDaysPassed(intern.startDate, intern.endDate, todayStr, holidayDates, leaveRanges);
    const attendancePercentage = calculateAttendancePerformance(attendedDaysCount, daysPassed);
    const absentDays = Math.max(0, daysPassed - attendedDaysCount);

    let leaveDaysCount = 0;
    leaveRanges.forEach(l => {
      leaveDaysCount += calculateTotalWorkDays(l.startDate, l.endDate, holidayDates, []);
    });

    return {
      totalWorkdays,
      daysPassed,
      attendedDays: attendedDaysCount,
      absentDays,
      leaveDaysCount,
      holidaysCount: holidayDates.length,
      attendancePercentage,
    };
  }, [intern, holidays, leaves, attendance]);

  const provisionalGrade = useMemo(() => {
    if (!performanceStats || performanceStats.attendancePercentage === null) return '—';
    return determineGrade(performanceStats.attendancePercentage);
  }, [performanceStats]);

  // Handler: Save Skills Evaluation
  const handleSaveSkills = async () => {
    if (!id || !auth.currentUser) return;
    setSkillsSaving(true);
    setSkillsMessage(null);

    try {
      const token = await auth.currentUser.getIdToken();
      const cleanSkills = skills
        .filter(s => s.name && s.name.trim() !== '')
        .map(s => ({
          name: s.name.trim(),
          percent: Math.min(100, Math.max(0, Number(s.percent) || 0)),
          note: s.note ? s.note.trim() : '',
        }));

      const res = await fetch('/api/admin/interns/skills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          internId: id,
          skills: cleanSkills,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save skills');
      }

      setSkills(cleanSkills);
      setSkillsMessage('ບັນທຶກການປະເມີນ Skills ສຳເລັດແລ້ວ!');
      setTimeout(() => setSkillsMessage(null), 4000);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'ເກີດຂໍ້ຜິດພາດໃນການບັນທຶກ Skills');
    } finally {
      setSkillsSaving(false);
    }
  };

  // Handler: Propose Final Grade
  const handleProposeGrade = async () => {
    if (!id || !auth.currentUser) return;
    setGradeSubmitting(true);
    setGradeMessage(null);

    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/interns/propose-grade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          internId: id,
          grade: selectedGrade,
          proposedNote,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to propose grade');
      }

      setIntern(prev => prev ? ({ ...prev, finalGrade: data.finalGrade }) : null);
      setGradeMessage(data.message || 'ສະເໜີເກຣດຮຽບຮ້ອຍແລ້ວ');
      setTimeout(() => setGradeMessage(null), 5000);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'ເກີດຂໍ້ຜິດພາດໃນການສະເໜີເກຣດ');
    } finally {
      setGradeSubmitting(false);
    }
  };

  // Handler: Review Daily Report
  const handleSubmitReportReview = async (reportId: string) => {
    if (!auth.currentUser) return;
    setReportReviewSubmitting(true);

    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/reports/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reportId,
          adminComment: reportComment,
          reviewStatus: reportReviewStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to review report');
      }

      setActiveReviewReportId(null);
      setReportComment('');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'ເກີດຂໍ້ຜິດພາດໃນການກວດສອບບົດລາຍງານ');
    } finally {
      setReportReviewSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0b0e14] text-white font-lao">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400 text-xs font-mono uppercase tracking-widest">
            ກຳລັງໂຫຼດຂໍ້ມູນນັກສຶກສາ...
          </p>
        </div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center font-lao p-6">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-3xl flex items-center justify-center text-red-500 mb-4 text-2xl">
          🚫
        </div>
        <h2 className="text-xl font-black text-white uppercase italic">ທ່ານບໍ່ມີສິດເຂົ້າເຖິງຂໍ້ມູນ</h2>
        <p className="text-xs text-gray-400 mt-2 max-w-md">
          ນັກສຶກສານີ້ບໍ່ໄດ້ຢູ່ໃນທີມງານພາຍໃຕ້ການຊີ້ນຳຂອງທ່ານ. Admin ສາມາດເບິ່ງ ແລະ ປະເມີນໄດ້ສະເພາະນັກສຶກສາໃນທີມຕົນເອງເທົ່ານັ້ນ.
        </p>
        <Link
          href="/admin/interns"
          className="mt-6 bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition-colors"
        >
          ກັບຄືນໄປລາຍຊື່ທີມງານຂອງທ່ານ
        </Link>
      </div>
    );
  }

  if (!intern) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center font-lao p-6">
        <h2 className="text-xl font-black text-red-500 uppercase italic">ບໍ່ພົບຂໍ້ມູນນັກສຶກສາ</h2>
        <Link href="/admin/interns" className="mt-4 text-xs text-gray-400 underline hover:text-white">
          ກັບຄືນ
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20 font-lao">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <button
          onClick={() => router.push('/admin/interns')}
          className="bg-gray-800/60 border border-gray-700 text-gray-300 px-4 py-2 rounded-xl text-xs font-bold hover:text-white hover:bg-gray-800 transition-all flex items-center space-x-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span>ກັບຄືນລາຍຊື່ນັກສຶກສາ</span>
        </button>

        <span className="text-[10px] text-gray-500 font-mono">
          UID: {intern.uid}
        </span>
      </div>

      {/* Intern Profile Card */}
      <section className="bg-[#161b22] border border-gray-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
          <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center font-black text-white text-4xl border border-red-500/20 shadow-lg">
            {intern.fullname?.charAt(0) || 'U'}
          </div>

          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <h1 className="text-3xl font-black text-white uppercase italic tracking-tight">
                {intern.fullname || '—'}
              </h1>
              <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border w-fit mx-auto md:mx-0 ${
                intern.status === 'approved'
                  ? 'bg-green-500/10 text-green-400 border-green-500/20'
                  : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
              }`}>
                {intern.status || 'Active'}
              </span>
            </div>

            <p className="text-gray-400 mt-1 font-mono text-xs">
              {intern.email} {intern.phone && `• 📞 ${intern.phone}`}
            </p>

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
              <div className="bg-[#0b0e14] border border-gray-800 rounded-xl p-3">
                <p className="text-[9px] text-gray-500 uppercase tracking-wider font-bold">ສະຖາບັນການສຶກສາ</p>
                <p className="text-xs font-bold text-gray-200 mt-0.5 truncate">{intern.college || '—'}</p>
              </div>
              <div className="bg-[#0b0e14] border border-gray-800 rounded-xl p-3">
                <p className="text-[9px] text-gray-500 uppercase tracking-wider font-bold">ສາຂາຮຽນ</p>
                <p className="text-xs font-bold text-gray-200 mt-0.5 truncate">{intern.major || '—'}</p>
              </div>
              <div className="bg-[#0b0e14] border border-gray-800 rounded-xl p-3">
                <p className="text-[9px] text-gray-500 uppercase tracking-wider font-bold">ວັນເລີ່ມຕົ້ນ</p>
                <p className="text-xs font-mono font-bold text-gray-200 mt-0.5">{intern.startDate || '—'}</p>
              </div>
              <div className="bg-[#0b0e14] border border-gray-800 rounded-xl p-3">
                <p className="text-[9px] text-gray-500 uppercase tracking-wider font-bold">ວັນສິ້ນສຸດ</p>
                <p className="text-xs font-mono font-bold text-gray-200 mt-0.5">{intern.endDate || '—'}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Attendance Performance & Grade Proposal Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Attendance Performance Card */}
        <section className="bg-[#161b22] border border-gray-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex justify-between items-center border-b border-gray-800 pb-4">
            <div>
              <h2 className="text-xs font-black text-gray-300 uppercase tracking-wider flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                ສະຖິຕິການມາວຽກ & ເກຣດຊົ່ວຄາວ
              </h2>
              <p className="text-[10px] text-gray-400 mt-0.5">ຄຳນວນຕາມປະຕິທິນຈິງ ຕັດວັນພັກ ແລະ ມື້ລາ</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-green-400 font-mono">
                {performanceStats && performanceStats.attendancePercentage !== null ? `${performanceStats.attendancePercentage}%` : '—'}
              </span>
              <p className="text-[9px] text-gray-500 font-bold uppercase">ການມາວຽກ</p>
            </div>
          </div>

          {performanceStats ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-[#0b0e14] border border-gray-800 p-3 rounded-xl text-center">
                <p className="text-[10px] text-gray-400">ວັນເຮັດວຽກທັງໝົດ</p>
                <p className="text-lg font-bold text-white mt-0.5">{performanceStats.totalWorkdays} ມື້</p>
              </div>
              <div className="bg-[#0b0e14] border border-gray-800 p-3 rounded-xl text-center">
                <p className="text-[10px] text-gray-400">ວັນທີ່ຜ່ານມາແລ້ວ</p>
                <p className="text-lg font-bold text-white mt-0.5">{performanceStats.daysPassed} ມື້</p>
              </div>
              <div className="bg-[#0b0e14] border border-green-500/20 p-3 rounded-xl text-center">
                <p className="text-[10px] text-green-400">ມາວຽກຕົວຈິງ</p>
                <p className="text-lg font-bold text-green-400 mt-0.5">{performanceStats.attendedDays} ມື້</p>
              </div>
              <div className="bg-[#0b0e14] border border-red-500/20 p-3 rounded-xl text-center">
                <p className="text-[10px] text-red-400">ຂາດວຽກ</p>
                <p className="text-lg font-bold text-red-400 mt-0.5">{performanceStats.absentDays} ມື້</p>
              </div>
              <div className="bg-[#0b0e14] border border-amber-500/20 p-3 rounded-xl text-center">
                <p className="text-[10px] text-amber-400">ລາວຽກ (Approved)</p>
                <p className="text-lg font-bold text-amber-400 mt-0.5">{performanceStats.leaveDaysCount} ມື້</p>
              </div>
              <div className="bg-[#0b0e14] border border-blue-500/20 p-3 rounded-xl text-center">
                <p className="text-[10px] text-blue-400">ວັນພັກລັດຖະການ</p>
                <p className="text-lg font-bold text-blue-400 mt-0.5">{performanceStats.holidaysCount} ມື້</p>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-gray-500 text-xs">
              ຍັງບໍ່ໄດ້ກຳນົດຊ່ວງເວລາຝຶກງານ
            </div>
          )}

          <div className="bg-[#0b0e14] border border-gray-800 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                ເກຣດຊົ່ວຄາວ (Provisional Grade)
              </span>
              <p className="text-[10px] text-gray-500 mt-0.5">ອີງຕາມສະຖິຕິການມາວຽກປະຈຸບັນ</p>
            </div>
            <span className="text-3xl font-black text-red-500 font-mono px-4 py-1 rounded-xl bg-red-500/10 border border-red-500/20">
              {provisionalGrade}
            </span>
          </div>
        </section>

        {/* Propose Final Grade Card */}
        <section className="bg-[#161b22] border border-gray-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="border-b border-gray-800 pb-4">
            <h2 className="text-xs font-black text-gray-300 uppercase tracking-wider flex items-center">
              <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
              ສະເໜີເກຣດສຸດທ້າຍ (Propose Final Grade)
            </h2>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Admin ສະເໜີເກຣດພ້ອມຄຳເຫັນ ເພື່ອໃຫ້ Super Admin ອະນຸມັດ ແລະ ອອກໃບຢັ້ງຢືນ
            </p>
          </div>

          {/* Current Proposal Status */}
          {intern.finalGrade?.grade ? (
            <div className="bg-[#0b0e14] border border-gray-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400 font-bold uppercase">ສະຖານະການສະເໜີ:</span>
                <span className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                  intern.finalGrade.status === 'pending_approval'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-green-500/10 text-green-400 border-green-500/30'
                }`}>
                  {intern.finalGrade.status === 'pending_approval' ? '⏳ ລໍຖ້າ Super Admin ອະນຸມັດ' : '✅ ອະນຸມັດແລ້ວ'}
                </span>
              </div>
              <div className="flex items-baseline space-x-3">
                <span className="text-3xl font-black text-white font-mono">{intern.finalGrade.grade}</span>
                <span className="text-xs text-gray-400">
                  {intern.finalGrade.proposedByName && `(ສະເໜີໂດຍ ${intern.finalGrade.proposedByName})`}
                </span>
              </div>
              {intern.finalGrade.proposedNote && (
                <p className="text-xs text-gray-300 bg-white/[0.02] p-2.5 rounded-lg border border-gray-800 italic">
                  &ldquo;{intern.finalGrade.proposedNote}&rdquo;
                </p>
              )}
            </div>
          ) : (
            <div className="bg-[#0b0e14] border border-gray-800 rounded-2xl p-4 text-center text-xs text-gray-500">
              ຍັງບໍ່ທັນມີການສະເໜີເກຣດສຸດທ້າຍໃຫ້ນັກສຶກສານີ້
            </div>
          )}

          {/* Proposal Form */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-gray-300 shrink-0">ເລືອກເກຣດ (A–F):</label>
                <div className="flex flex-wrap gap-2">
                  {VALID_GRADES.map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setSelectedGrade(g)}
                      className={`px-3.5 py-1.5 rounded-xl font-mono font-black text-xs transition-all border ${
                        selectedGrade === g
                          ? 'bg-red-600 text-white border-red-500 scale-105 shadow-md shadow-red-900/30'
                          : 'bg-[#0b0e14] text-gray-400 border-gray-800 hover:text-white'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* ເກຣດຊົ່ວຄາວຂ້າງໆ */}
              <div className="flex items-center space-x-2 bg-[#0b0e14] border border-gray-800 px-3 py-1.5 rounded-xl">
                <span className="text-[10px] text-gray-400 font-bold uppercase">ເກຣດຊົ່ວຄາວ:</span>
                <span className="text-sm font-black text-green-400 font-mono">{provisionalGrade}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1">
                ຄຳເຫັນ / ເຫດຜົນປະກອບການສະເໜີເກຣດ:
              </label>
              <textarea
                rows={3}
                value={proposedNote}
                onChange={(e) => setProposedNote(e.target.value)}
                placeholder="ລະບຸຜົນງານ, ຈຸດເດັ່ນ ຫຼື ເຫດຜົນໃນການຕັດເກຣດ..."
                className="w-full bg-[#0b0e14] border border-gray-800 text-xs text-white p-3 rounded-xl outline-none focus:border-red-500 transition-colors"
              />
            </div>

            {gradeMessage && (
              <div className="text-xs font-bold text-green-400 bg-green-500/10 p-2.5 rounded-xl border border-green-500/20 text-center">
                {gradeMessage}
              </div>
            )}

            <button
              onClick={handleProposeGrade}
              disabled={gradeSubmitting}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold py-3 rounded-xl transition-colors shadow-lg shadow-red-900/20 flex items-center justify-center space-x-2"
            >
              {gradeSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>ກຳລັງສະເໜີເກຣດ...</span>
                </>
              ) : (
                <span>
                  {intern.finalGrade?.grade ? 'ປັບປຸງການສະເໜີເກຣດ' : 'ສະເໜີເກຣດໃຫ້ Super Admin'}
                </span>
              )}
            </button>
          </div>
        </section>
      </div>

      {/* Skills Track Editor Section */}
      <section className="bg-[#161b22] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="px-8 py-6 border-b border-gray-800 bg-white/[0.02] flex justify-between items-center">
          <div>
            <h2 className="text-xs font-black text-gray-300 uppercase tracking-wider flex items-center">
              <span className="w-2 h-2 bg-red-600 rounded-full mr-2"></span>
              ການປະເມີນທັກສະ (Skills Evaluation)
            </h2>
            <p className="text-[10px] text-gray-400 mt-0.5">
              ກຳນົດທັກສະ, ຄະແນນເປີເຊັນ (0-100) ແລະ ໝາຍເຫດ ສຳລັບນັກສຶກສາ
            </p>
          </div>
          <span className="text-[10px] font-bold text-gray-400 bg-gray-800 px-3 py-1 rounded-full">
            {skills.length} ທັກສະ
          </span>
        </div>

        <div className="p-8 space-y-4">
          {skills.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-xs">
              ຍັງບໍ່ທັນມີຂໍ້ມູນທັກສະ — ກົດປຸ່ມ &ldquo;+ ເພີ່ມທັກສະ&rdquo; ດ້ານລຸ່ມ
            </div>
          ) : (
            skills.map((skill, idx) => (
              <div key={idx} className="bg-[#0b0e14] border border-gray-800 rounded-2xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  {/* Skill Name */}
                  <input
                    type="text"
                    value={skill.name}
                    placeholder="ຊື່ທັກສະ (ເຊັ່ນ: Fiber Optics, React, Network Configuration)"
                    onChange={(e) => {
                      const updated = [...skills];
                      updated[idx] = { ...updated[idx], name: e.target.value };
                      setSkills(updated);
                    }}
                    className="flex-1 bg-[#161b22] border border-gray-700 text-xs text-white rounded-xl px-4 py-2.5 outline-none focus:border-red-500 w-full"
                  />

                  {/* Percentage Input */}
                  <div className="flex items-center space-x-2 shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={skill.percent}
                      onChange={(e) => {
                        const val = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                        const updated = [...skills];
                        updated[idx] = { ...updated[idx], percent: val };
                        setSkills(updated);
                      }}
                      className="w-16 bg-[#161b22] border border-gray-700 text-xs font-black text-red-400 rounded-xl px-3 py-2.5 text-center outline-none focus:border-red-500"
                    />
                    <span className="text-gray-400 text-xs font-bold">%</span>

                    {/* Delete button */}
                    <button
                      onClick={() => setSkills(skills.filter((_, i) => i !== idx))}
                      className="text-gray-500 hover:text-red-500 p-2 transition-colors"
                      title="ລຶບທັກສະນີ້"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Note */}
                <input
                  type="text"
                  value={skill.note || ''}
                  placeholder="ໝາຍເຫດ ຫຼື ຄຳແນະນຳເພີ່ມເຕີມ..."
                  onChange={(e) => {
                    const updated = [...skills];
                    updated[idx] = { ...updated[idx], note: e.target.value };
                    setSkills(updated);
                  }}
                  className="w-full bg-[#161b22] border border-gray-800 text-[11px] text-gray-300 rounded-xl px-3 py-1.5 outline-none focus:border-red-500"
                />

                {/* Progress bar preview */}
                <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-red-600 to-red-400 h-full rounded-full transition-all duration-300"
                    style={{ width: `${skill.percent}%` }}
                  />
                </div>
              </div>
            ))
          )}

          {skillsMessage && (
            <div className="text-xs font-bold text-green-400 bg-green-500/10 p-2.5 rounded-xl border border-green-500/20 text-center">
              {skillsMessage}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => setSkills([...skills, { name: '', percent: 60, note: '' }])}
              className="text-xs font-bold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-600 border border-red-500/20 px-4 py-2.5 rounded-xl transition-all"
            >
              + ເພີ່ມທັກສະ
            </button>

            <button
              onClick={handleSaveSkills}
              disabled={skillsSaving}
              className="text-xs font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center space-x-1.5"
            >
              {skillsSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>ກຳລັງບັນທຶກ...</span>
                </>
              ) : (
                <span>ບັນທຶກການປະເມີນ Skills</span>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Attendance & Daily Reports Tabular Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Attendance History */}
        <section className="bg-[#161b22] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="px-6 py-5 border-b border-gray-800 bg-white/[0.02] flex justify-between items-center">
            <h2 className="text-xs font-black text-gray-300 uppercase tracking-wider">
              ປະຫວັດການລົງເວລາ ({attendance.length} ວັນ)
            </h2>
          </div>

          <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
            {attendance.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-xs">ຍັງບໍ່ມີຂໍ້ມູນການລົງເວລາ</div>
            ) : (
              attendance.map((log) => {
                const workCalc = calculateWorkHours(log.checkInTime, log.checkOutTime);
                const derivedCheckout = log.checkOutTime
                  ? log.checkOutStatus || 'normal'
                  : isForgotCheckout(log.date, log.checkOutTime)
                  ? 'forgot-checkout'
                  : 'pending';

                const checkInFormatted = log.checkInTime
                  ? new Date(log.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
                  : '--:--';
                const checkOutFormatted = log.checkOutTime
                  ? new Date(log.checkOutTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
                  : '--:--';

                return (
                  <div key={log.id} className="bg-[#0b0e14] border border-gray-800 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center space-x-2">
                        <span>{log.date}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          log.checkInStatus === 'late'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : 'bg-green-500/10 text-green-400 border border-green-500/20'
                        }`}>
                          {log.checkInStatus === 'late' ? 'ມາຊ້າ' : 'ທັນເວລາ'}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-1 font-mono">
                        ເຂົ້າ: {checkInFormatted} → ອອກ: {checkOutFormatted}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-bold font-mono text-white">
                        {workCalc !== null && workCalc > 0 ? `${workCalc} ຊມ` : '—'}
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded mt-0.5 inline-block ${
                        derivedCheckout === 'normal'
                          ? 'bg-green-500/10 text-green-400'
                          : derivedCheckout === 'early-leave'
                          ? 'bg-amber-500/10 text-amber-400'
                          : derivedCheckout === 'forgot-checkout'
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-gray-800 text-gray-400'
                      }`}>
                        {derivedCheckout === 'normal' ? 'ປົກກະຕິ' : derivedCheckout === 'early-leave' ? 'ອອກກ່ອນ' : derivedCheckout === 'forgot-checkout' ? 'ລືມ Check-out' : 'ຢູ່ໃນເວລາ'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Daily Reports Review */}
        <section className="bg-[#161b22] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="px-6 py-5 border-b border-gray-800 bg-white/[0.02] flex justify-between items-center">
            <h2 className="text-xs font-black text-gray-300 uppercase tracking-wider">
              ບົດລາຍງານປະຈຳວັນ ({reports.length} ສະບັບ)
            </h2>
          </div>

          <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
            {reports.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-xs">ຍັງບໍ່ມີບົດລາຍງານ</div>
            ) : (
              reports.map((rep) => (
                <div key={rep.id} className="bg-[#0b0e14] border border-gray-800 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="text-xs font-bold text-white">{rep.date}</div>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                      rep.reviewStatus === 'approved'
                        ? 'bg-green-500/10 text-green-400 border-green-500/20'
                        : rep.reviewStatus === 'needs-revision'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-gray-800 text-gray-400 border-gray-700'
                    }`}>
                      {rep.reviewStatus === 'approved' ? 'ອະນຸມັດແລ້ວ' : rep.reviewStatus === 'needs-revision' ? 'ໃຫ້ແກ້ໄຂ' : 'ລໍຖ້າກວດ'}
                    </span>
                  </div>

                  <p className="text-xs text-gray-300 leading-relaxed bg-white/[0.01] p-3 rounded-xl border border-gray-800/60 whitespace-pre-line">
                    {rep.report}
                  </p>

                  {rep.adminComment && (
                    <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-2.5 text-[11px]">
                      <span className="text-[10px] font-bold text-red-400 uppercase">ຄຳເຫັນ Admin:</span>
                      <p className="text-gray-300 mt-0.5">{rep.adminComment}</p>
                    </div>
                  )}

                  {/* Review Action Toggle */}
                  {activeReviewReportId === rep.id ? (
                    <div className="bg-[#161b22] border border-gray-700 rounded-xl p-3 space-y-2 mt-2">
                      <textarea
                        rows={2}
                        value={reportComment}
                        onChange={(e) => setReportComment(e.target.value)}
                        placeholder="ປ້ອນຄຳເຫັນ ຫຼື ຄຳແນະນຳ..."
                        className="w-full bg-[#0b0e14] border border-gray-700 text-xs text-white p-2 rounded-lg outline-none focus:border-red-500"
                      />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setReportReviewStatus('approved')}
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
                              reportReviewStatus === 'approved'
                                ? 'bg-green-600 text-white border-green-500'
                                : 'bg-[#0b0e14] text-gray-400 border-gray-700'
                            }`}
                          >
                            ອະນຸມັດ (Approve)
                          </button>
                          <button
                            type="button"
                            onClick={() => setReportReviewStatus('needs-revision')}
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
                              reportReviewStatus === 'needs-revision'
                                ? 'bg-amber-600 text-white border-amber-500'
                                : 'bg-[#0b0e14] text-gray-400 border-gray-700'
                            }`}
                          >
                            ໃຫ້ແກ້ໄຂ (Needs Revision)
                          </button>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setActiveReviewReportId(null)}
                            className="text-xs text-gray-400 hover:text-white px-2 py-1"
                          >
                            ຍົກເລີກ
                          </button>
                          <button
                            onClick={() => handleSubmitReportReview(rep.id)}
                            disabled={reportReviewSubmitting}
                            className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1 rounded-lg disabled:opacity-50"
                          >
                            {reportReviewSubmitting ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setActiveReviewReportId(rep.id);
                        setReportComment(rep.adminComment || '');
                        setReportReviewStatus(rep.reviewStatus === 'needs-revision' ? 'needs-revision' : 'approved');
                      }}
                      className="text-[11px] font-bold text-red-400 hover:underline inline-flex items-center space-x-1"
                    >
                      <span>💬 ກວດສອບ & ໃຫ້ຄຳເຫັນ</span>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
