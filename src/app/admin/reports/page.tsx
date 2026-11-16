'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, where, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { DailyReport, UserProfile, Department } from '@/types';

export default function AllReportsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'superadmin' | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');

  const [reports, setReports] = useState<DailyReport[]>([]);
  const [interns, setInterns] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedIntern, setSelectedIntern] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'needs-revision'>('all');

  // Review dialog state per report
  const [reviewingReportId, setReviewingReportId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [reviewStatusChoice, setReviewStatusChoice] = useState<'approved' | 'needs-revision'>('approved');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    let unsubscribeReports: (() => void) | undefined;
    let unsubscribeInterns: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/login');
        return;
      }

      try {
        // Fetch current user doc for role
        const userDocRef = collection(db, 'users');
        const qUser = query(userDocRef, where('email', '==', user.email));
        const userSnap = await getDocs(qUser);

        if (userSnap.empty) {
          router.replace('/login');
          return;
        }

        const role = userSnap.docs[0].data()?.role;
        setUserRole(role);
        setCurrentUser({ uid: userSnap.docs[0].id, ...userSnap.docs[0].data() });

        if (role !== 'admin' && role !== 'superadmin') {
          router.replace('/dashboard');
          return;
        }

        // Fetch departments if superadmin
        if (role === 'superadmin') {
          const deptsSnap = await getDocs(collection(db, 'departments'));
          setDepartments(deptsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
        }

        // Fetch interns scoped
        let qInterns;
        if (role === 'superadmin') {
          qInterns = query(collection(db, 'users'), where('role', '==', 'intern'));
        } else {
          qInterns = query(
            collection(db, 'users'),
            where('role', '==', 'intern'),
            where('supervisorId', '==', user.uid)
          );
        }

        unsubscribeInterns = onSnapshot(qInterns, (snap) => {
          setInterns(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
        }, (err) => console.error('Error fetching interns:', err));

        // Fetch daily reports scoped
        let qReports;
        if (role === 'superadmin') {
          qReports = query(collection(db, 'daily_reports'), orderBy('date', 'desc'));
        } else {
          qReports = query(
            collection(db, 'daily_reports'),
            where('supervisorId', '==', user.uid),
            orderBy('date', 'desc')
          );
        }

        unsubscribeReports = onSnapshot(qReports, (snapshot) => {
          const docs = snapshot.docs.map(doc => {
            const data = doc.data() as any;
            return {
              id: doc.id,
              userId: data.userId,
              userName: data.userName,
              date: data.date,
              report: data.report || data.content || '',
              adminComment: data.adminComment || null,
              reviewStatus: data.reviewStatus || 'pending',
              reviewedBy: data.reviewedBy || null,
              departmentId: data.departmentId || null,
              supervisorId: data.supervisorId || null,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
            } as DailyReport;
          });
          setReports(docs);
          setLoading(false);
        }, (err) => {
          console.error('Reports listener error:', err);
          setLoading(false);
        });

      } catch (err) {
        console.error('Init reports error:', err);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeReports) unsubscribeReports();
      if (unsubscribeInterns) unsubscribeInterns();
    };
  }, [router]);

  const deptMap = useMemo(() => {
    const map: Record<string, string> = {};
    departments.forEach(d => {
      map[d.id] = d.name;
    });
    return map;
  }, [departments]);

  const internMap = useMemo(() => {
    const map: Record<string, UserProfile> = {};
    interns.forEach(i => {
      map[i.uid] = i;
    });
    return map;
  }, [interns]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    const validInternIds = new Set(interns.map(i => i.uid));

    return reports.filter(r => {
      // Role scope protection: Ensure intern belongs to scoped interns if admin
      if (userRole === 'admin' && !validInternIds.has(r.userId)) {
        return false;
      }

      // Superadmin department filter
      if (userRole === 'superadmin' && selectedDeptId !== 'all') {
        const internProfile = internMap[r.userId];
        if (internProfile?.departmentId !== selectedDeptId) {
          return false;
        }
      }

      // Specific intern filter
      if (selectedIntern !== 'all' && r.userId !== selectedIntern) {
        return false;
      }

      // Review status filter
      if (statusFilter !== 'all') {
        const curStatus = r.reviewStatus || 'pending';
        if (curStatus !== statusFilter) return false;
      }

      // Date range filter (YYYY-MM-DD)
      if (startDate && r.date < startDate) return false;
      if (endDate && r.date > endDate) return false;

      return true;
    });
  }, [reports, interns, userRole, selectedDeptId, selectedIntern, statusFilter, startDate, endDate, internMap]);

  // Handle Review Submission
  const handleSaveReview = async (reportId: string) => {
    if (!auth.currentUser) return;
    setSubmittingReview(true);

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
          adminComment: feedbackText,
          reviewStatus: reviewStatusChoice,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to review report');
      }

      setReviewingReportId(null);
      setFeedbackText('');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'ເກີດຂໍ້ຜິດພາດໃນການບັນທຶກ');
    } finally {
      setSubmittingReview(false);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredReports.length === 0) {
      alert('ບໍ່ມີລາຍງານທີ່ຈະອອກ Excel');
      return;
    }

    const exportData = filteredReports.map(r => {
      const profile = internMap[r.userId];
      const deptName = (profile?.departmentId && deptMap[profile.departmentId]) || '—';
      const statusLao =
        r.reviewStatus === 'approved'
          ? 'ອະນຸມັດ'
          : r.reviewStatus === 'needs-revision'
          ? 'ໃຫ້ແກ້ໄຂ'
          : 'ລໍຖ້າກວດສອບ';

      return {
        'ວັນທີ': r.date,
        'ຊື່ ແລະ ນາມສະກຸນ': r.userName || profile?.fullname || '—',
        'ພະແນກ': deptName,
        'ເນື້ອໃນບົດລາຍງານ': r.report,
        'ສະຖານະກວດກາ': statusLao,
        'ຄຳເຫັນ Admin': r.adminComment || '—',
        'ຜູ້ກວດກາ': r.reviewedBy || '—',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    worksheet['!cols'] = [
      { wch: 14 }, { wch: 24 }, { wch: 20 }, { wch: 50 },
      { wch: 16 }, { wch: 30 }, { wch: 24 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Daily_Reports');
    const fileName = `LTC_Daily_Reports_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="pb-10 font-lao space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
            <h1 className="text-3xl font-black text-white uppercase italic tracking-tight">
              {userRole === 'superadmin' ? 'ບົດລາຍງານທັງໝົດ (Super Admin)' : 'ບົດລາຍງານປະຈຳວັນຂອງທີມ'}
            </h1>
          </div>
          <p className="text-[11px] text-gray-400 uppercase tracking-widest mt-1">
            {userRole === 'superadmin'
              ? 'ກວດສອບ ແລະ ໃຫ້ Feedback ບົດລາຍງານນັກສຶກສາທຸກພະແນກ'
              : `ກວດສອບ ແລະ ໃຫ້ Feedback ບົດລາຍງານສະເພາະທີມງານຂອງທ່ານ (${interns.length} ຄົນ)`}
          </p>
        </div>

        <button
          onClick={handleExportExcel}
          className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 shadow-md"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Export Excel</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#161b22] border border-gray-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Superadmin Department Select */}
          {userRole === 'superadmin' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase">ພະແນກ</label>
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="bg-[#0b0e14] border border-gray-700 text-xs text-white rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-red-500 w-44"
              >
                <option value="all">ທຸກພະແນກ</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Intern Select */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase">ນັກສຶກສາ</label>
            <select
              value={selectedIntern}
              onChange={(e) => setSelectedIntern(e.target.value)}
              className="bg-[#0b0e14] border border-gray-700 text-xs text-white rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-red-500 w-52"
            >
              <option value="all">ທຸກຄົນ ({interns.length} ຄົນ)</option>
              {interns.map(i => (
                <option key={i.uid} value={i.uid}>{i.fullname || i.email}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase">ສະຖານະກວດກາ</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-[#0b0e14] border border-gray-700 text-xs text-white rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-red-500 w-40"
            >
              <option value="all">ທັງໝົດ</option>
              <option value="pending">ລໍຖ້າກວດ (Pending)</option>
              <option value="approved">ອະນຸມັດ (Approved)</option>
              <option value="needs-revision">ໃຫ້ແກ້ໄຂ (Needs Revision)</option>
            </select>
          </div>

          {/* Start Date */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase">ແຕ່ວັນທີ</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-[#0b0e14] border border-gray-700 text-xs text-white rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          {/* End Date */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase">ເຖິງວັນທີ</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-[#0b0e14] border border-gray-700 text-xs text-white rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          {/* Reset Filters */}
          <button
            onClick={() => {
              setSelectedDeptId('all');
              setSelectedIntern('all');
              setStatusFilter('all');
              setStartDate('');
              setEndDate('');
            }}
            className="text-xs font-bold text-gray-400 hover:text-white px-3 py-2 rounded-xl border border-gray-800 hover:bg-gray-800 transition-colors"
          >
            ລ້າງ Filter
          </button>
        </div>

        <div className="text-right text-[11px] text-gray-400 font-mono">
          ພົບ <span className="text-red-400 font-bold">{filteredReports.length}</span> / {reports.length} ບົດລາຍງານ
        </div>
      </div>

      {/* Reports List */}
      <div className="space-y-4">
        {loading ? (
          <div className="py-20 text-center text-gray-500 text-xs font-mono">
            ກຳລັງໂຫຼດບົດລາຍງານ...
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="bg-[#161b22] border border-gray-800 rounded-3xl p-16 text-center text-gray-500 text-xs">
            ບໍ່ພົບບົດລາຍງານຕາມເງື່ອນໄຂທີ່ເລືອກ
          </div>
        ) : (
          filteredReports.map((report) => {
            const internProfile = internMap[report.userId];
            const deptName = (internProfile?.departmentId && deptMap[internProfile.departmentId]) || '—';

            return (
              <div
                key={report.id}
                className="bg-[#161b22] border border-gray-800 rounded-3xl p-6 shadow-xl space-y-4 hover:border-gray-700 transition-all"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-red-600/10 text-red-500 font-black flex items-center justify-center border border-red-500/20">
                      {report.userName?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-sm">
                          {report.userName || internProfile?.fullname || '—'}
                        </span>
                        <span className="text-[10px] text-gray-400 bg-gray-800 px-2 py-0.5 rounded-md">
                          {deptName}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                        ວັນທີ: {report.date}
                      </div>
                    </div>
                  </div>

                  {/* Review Status Badge */}
                  <div className="flex items-center space-x-2">
                    <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${
                      report.reviewStatus === 'approved'
                        ? 'bg-green-500/10 text-green-400 border-green-500/30'
                        : report.reviewStatus === 'needs-revision'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                    }`}>
                      {report.reviewStatus === 'approved'
                        ? '✅ ອະນຸມັດແລ້ວ'
                        : report.reviewStatus === 'needs-revision'
                        ? '⚠️ ໃຫ້ແກ້ໄຂຄືນ'
                        : '⏳ ລໍຖ້າກວດສອບ'}
                    </span>
                  </div>
                </div>

                {/* Content Box */}
                <div className="bg-[#0b0e14] border border-gray-800/80 rounded-2xl p-4 text-xs text-gray-200 leading-relaxed whitespace-pre-line">
                  {report.report}
                </div>

                {/* Admin Feedback Display */}
                {report.adminComment && (
                  <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-red-400 uppercase">
                        ຄຳເຫັນ Admin:
                      </span>
                      {report.reviewedBy && (
                        <span className="text-[9px] text-gray-500 font-mono">
                          ກວດສອບໂດຍ: {report.reviewedBy}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-300 mt-1">{report.adminComment}</p>
                  </div>
                )}

                {/* Inline Review Panel */}
                {reviewingReportId === report.id ? (
                  <div className="bg-[#0b0e14] border border-red-500/30 rounded-2xl p-4 space-y-3">
                    <label className="text-xs font-bold text-gray-300 block">
                      ໃຫ້ຄຳເຫັນ ແລະ ປ່ຽນສະຖານະການກວດສອບ:
                    </label>
                    <textarea
                      rows={2}
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="ປ້ອນຄຳເຫັນ, ຂໍ້ແນະນຳ ຫຼື ວຽກທີ່ຕ້ອງປັບປຸງ..."
                      className="w-full bg-[#161b22] border border-gray-700 text-xs text-white p-3 rounded-xl outline-none focus:border-red-500"
                    />

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setReviewStatusChoice('approved')}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all ${
                            reviewStatusChoice === 'approved'
                              ? 'bg-green-600 text-white border-green-500 shadow-md'
                              : 'bg-[#161b22] text-gray-400 border-gray-800'
                          }`}
                        >
                          ອະນຸມັດ (Approve)
                        </button>
                        <button
                          type="button"
                          onClick={() => setReviewStatusChoice('needs-revision')}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all ${
                            reviewStatusChoice === 'needs-revision'
                              ? 'bg-amber-600 text-white border-amber-500 shadow-md'
                              : 'bg-[#161b22] text-gray-400 border-gray-800'
                          }`}
                        >
                          ໃຫ້ແກ້ໄຂ (Needs Revision)
                        </button>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setReviewingReportId(null)}
                          className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-xl border border-gray-800"
                        >
                          ຍົກເລີກ
                        </button>
                        <button
                          onClick={() => handleSaveReview(report.id)}
                          disabled={submittingReview}
                          className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-1.5 rounded-xl disabled:opacity-50"
                        >
                          {submittingReview ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກຜົນກວດສອບ'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        setReviewingReportId(report.id);
                        setFeedbackText(report.adminComment || '');
                        setReviewStatusChoice(report.reviewStatus === 'needs-revision' ? 'needs-revision' : 'approved');
                      }}
                      className="text-xs font-bold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-600 px-3 py-1.5 rounded-xl border border-red-500/20 transition-all flex items-center space-x-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <span>ກວດສອບ & ໃຫ້ Feedback</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
