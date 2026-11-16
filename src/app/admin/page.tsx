'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { UserProfile, AttendanceRecord, Department, LeaveRequest } from '@/types';
import { calculateWorkHours, isForgotCheckout } from '@/lib/attendance-rules';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'superadmin' | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [workStartCutoff, setWorkStartCutoff] = useState('08:00');

  // Data states
  const [interns, setInterns] = useState<UserProfile[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [todayLeaves, setTodayLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Real-time clock
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: true }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Auth & Profile Listener
  useEffect(() => {
    let unsubscribeInterns: (() => void) | undefined;
    let unsubscribeAttendance: (() => void) | undefined;
    let unsubscribeLeaves: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/login');
        return;
      }

      try {
        // Fetch current user document
        const userDocRef = collection(db, 'users');
        const qUser = query(userDocRef, where('email', '==', user.email));
        const userSnap = await getDocs(qUser);

        if (userSnap.empty) {
          router.replace('/login');
          return;
        }

        const userData = userSnap.docs[0].data() as UserProfile;
        if (userData.role !== 'admin' && userData.role !== 'superadmin') {
          router.replace('/dashboard');
          return;
        }

        setCurrentUser({ ...userData, uid: userSnap.docs[0].id });
        setUserRole(userData.role);

        // Fetch system settings for workStart cutoff
        try {
          const sysSnap = await getDoc(doc(db, 'settings', 'system'));
          if (sysSnap.exists()) {
            const sysData = sysSnap.data();
            if (sysData?.workStart) {
              setWorkStartCutoff(sysData.workStart);
            }
          }
        } catch (sErr) {
          console.error('Error fetching system settings:', sErr);
        }

        // Fetch departments for filtering (if superadmin)
        if (userData.role === 'superadmin') {
          try {
            const deptsSnap = await getDocs(collection(db, 'departments'));
            const deptList = deptsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department));
            setDepartments(deptList.filter(d => d.active !== false));
          } catch (dErr) {
            console.error('Error fetching departments:', dErr);
          }
        }

        // 1. Fetch Interns scoped to supervisor (or all for superadmin)
        let internsQuery;
        if (userData.role === 'superadmin') {
          internsQuery = query(collection(db, 'users'), where('role', '==', 'intern'));
        } else {
          internsQuery = query(
            collection(db, 'users'),
            where('role', '==', 'intern'),
            where('supervisorId', '==', userSnap.docs[0].id)
          );
        }

        unsubscribeInterns = onSnapshot(internsQuery, (snapshot) => {
          const list = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
          setInterns(list);
        }, (err) => {
          console.error('Error loading interns:', err);
        });

        // 2. Fetch Attendance for selectedDate
        let attendQuery;
        if (userData.role === 'superadmin') {
          attendQuery = query(
            collection(db, 'attendance'),
            where('date', '==', selectedDate)
          );
        } else {
          attendQuery = query(
            collection(db, 'attendance'),
            where('date', '==', selectedDate),
            where('supervisorId', '==', userSnap.docs[0].id)
          );
        }

        unsubscribeAttendance = onSnapshot(attendQuery, (snapshot) => {
          const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
          setAttendanceRecords(docs);
          setLoading(false);
        }, (err) => {
          console.error('Attendance listener error:', err);
          setLoading(false);
        });

        // 3. Fetch Leaves covering selectedDate
        let leavesQuery;
        if (userData.role === 'superadmin') {
          leavesQuery = query(
            collection(db, 'leave_requests'),
            where('status', '==', 'approved')
          );
        } else {
          leavesQuery = query(
            collection(db, 'leave_requests'),
            where('status', '==', 'approved'),
            where('supervisorId', '==', userSnap.docs[0].id)
          );
        }

        unsubscribeLeaves = onSnapshot(leavesQuery, (snapshot) => {
          const allApproved = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest));
          // Filter leaves covering selectedDate
          const covering = allApproved.filter(l => l.startDate <= selectedDate && l.endDate >= selectedDate);
          setTodayLeaves(covering);
        }, (err) => {
          console.error('Leave requests error:', err);
        });

      } catch (err) {
        console.error('Dashboard init error:', err);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeInterns) unsubscribeInterns();
      if (unsubscribeAttendance) unsubscribeAttendance();
      if (unsubscribeLeaves) unsubscribeLeaves();
    };
  }, [selectedDate, router]);

  // Department map for quick lookup
  const deptMap = useMemo(() => {
    const map: Record<string, string> = {};
    departments.forEach(d => {
      map[d.id] = d.name;
    });
    return map;
  }, [departments]);

  // Intern map
  const internMap = useMemo(() => {
    const map: Record<string, UserProfile> = {};
    interns.forEach(i => {
      map[i.uid] = i;
    });
    return map;
  }, [interns]);

  // Filtered interns according to department (for superadmin)
  const filteredInterns = useMemo(() => {
    if (userRole === 'superadmin' && selectedDeptId !== 'all') {
      return interns.filter(i => i.departmentId === selectedDeptId);
    }
    return interns;
  }, [interns, userRole, selectedDeptId]);

  const scopedInternIds = useMemo(() => {
    return new Set(filteredInterns.map(i => i.uid));
  }, [filteredInterns]);

  // Scoped Attendance
  const scopedAttendance = useMemo(() => {
    return attendanceRecords.filter(a => scopedInternIds.has(a.userId));
  }, [attendanceRecords, scopedInternIds]);

  // Scoped Leaves
  const scopedLeaves = useMemo(() => {
    return todayLeaves.filter(l => scopedInternIds.has(l.userId));
  }, [todayLeaves, scopedInternIds]);

  // Derived Statistics
  const stats = useMemo(() => {
    const total = filteredInterns.length;
    const present = scopedAttendance.filter(a => !!a.checkInTime).length;
    const late = scopedAttendance.filter(a => a.checkInStatus === 'late').length;
    const onLeave = scopedLeaves.length;
    
    // Not checked out: checked in, but checkout is null
    const notCheckedOut = scopedAttendance.filter(a => a.checkInTime && !a.checkOutTime).length;

    return { total, present, late, onLeave, notCheckedOut };
  }, [filteredInterns, scopedAttendance, scopedLeaves]);

  // Combined Rows for Table
  const tableRows = useMemo(() => {
    const rows = filteredInterns.map(intern => {
      const attend = scopedAttendance.find(a => a.userId === intern.uid);
      const leave = scopedLeaves.find(l => l.userId === intern.uid);

      let checkInTimeStr = '--:--';
      let checkOutTimeStr = '--:--';
      let netHours = 0;
      let checkOutDerivedStatus: 'normal' | 'early-leave' | 'forgot-checkout' | 'pending' | null = null;

      if (attend?.checkInTime) {
        try {
          checkInTimeStr = new Date(attend.checkInTime).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
        } catch {
          checkInTimeStr = attend.checkInTime;
        }
      }

      if (attend?.checkOutTime) {
        try {
          checkOutTimeStr = new Date(attend.checkOutTime).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
        } catch {
          checkOutTimeStr = attend.checkOutTime;
        }
        checkOutDerivedStatus = attend.checkOutStatus || 'normal';
        netHours = calculateWorkHours(attend.checkInTime, attend.checkOutTime) ?? 0;
      } else if (attend?.checkInTime) {
        if (isForgotCheckout(attend.date, attend.checkOutTime)) {
          checkOutDerivedStatus = 'forgot-checkout';
        } else {
          checkOutDerivedStatus = 'pending';
        }
      }

      return {
        userId: intern.uid,
        fullname: intern.fullname || '—',
        email: intern.email,
        phone: intern.phone || '—',
        college: intern.college || '—',
        departmentName: (intern.departmentId && deptMap[intern.departmentId]) || 'ບໍ່ໄດ້ລະບຸ',
        attend,
        leave,
        checkInTimeStr,
        checkOutTimeStr,
        checkInStatus: attend?.checkInStatus || null,
        checkOutStatus: checkOutDerivedStatus,
        netHours,
        distance: attend?.checkInDistance ? `${attend.checkInDistance.toFixed(0)} ມ` : '—',
      };
    });

    if (!searchTerm.trim()) return rows;

    const term = searchTerm.toLowerCase();
    return rows.filter(r =>
      r.fullname.toLowerCase().includes(term) ||
      r.email.toLowerCase().includes(term) ||
      r.departmentName.toLowerCase().includes(term)
    );
  }, [filteredInterns, scopedAttendance, scopedLeaves, deptMap, searchTerm]);

  // Export to Excel
  const handleExportExcel = () => {
    if (tableRows.length === 0) {
      alert('ບໍ່ມີຂໍ້ມູນທີ່ຈະ Export');
      return;
    }

    const exportData = tableRows.map(r => ({
      'ວັນທີ': selectedDate,
      'ຊື່ ແລະ ນາມສະກຸນ': r.fullname,
      'ອີເມວ': r.email,
      'ເບີໂທ': r.phone,
      'ພະແນກ': r.departmentName,
      'ສະຖານະວຽກ': r.leave
        ? (r.leave.periods === 'morning'
            ? (r.attend ? 'ມາວຽກ (ລາເຄິ່ງມື້ເຊົ້າ)' : 'ລາເຄິ່ງມື້ເຊົ້າ (ຍັງບໍ່ Check-in)')
            : r.leave.periods === 'afternoon'
            ? (r.attend ? 'ມາວຽກ (ລາເຄິ່ງມື້ແລງ)' : 'ລາເຄິ່ງມື້ແລງ (ຍັງບໍ່ Check-in)')
            : `ລາວຽກ (${r.leave.leaveTypeName || 'Approved'})`)
        : (r.attend ? 'ມາວຽກ' : 'ຂາດ / ຍັງບໍ່ລົງເວລາ'),
      'ເວລາເຂົ້າ': r.checkInTimeStr,
      'ສະຖານະເຂົ້າ': r.checkInStatus === 'late' ? 'ມາຊ້າ' : (r.checkInStatus === 'on-time' ? 'ທັນເວລາ' : '—'),
      'ໄລຍະຫ່າງ GPS': r.distance,
      'ເວລາອອກ': r.checkOutTimeStr,
      'ສະຖານະອອກ': r.checkOutStatus === 'normal'
        ? 'ປົກກະຕິ'
        : r.checkOutStatus === 'early-leave'
        ? 'ອອກກ່ອນ'
        : r.checkOutStatus === 'forgot-checkout'
        ? 'ລືມ Check-out'
        : r.checkOutStatus === 'pending'
        ? 'ຍັງບໍ່ Check-out'
        : '—',
      'ຊົ່ວໂມງສຸດທິ': r.netHours > 0 ? `${r.netHours} ຊມ` : '0',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    worksheet['!cols'] = [
      { wch: 12 }, { wch: 24 }, { wch: 22 }, { wch: 14 }, { wch: 20 },
      { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 16 }, { wch: 12 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
    
    const fileName = `LTC_Attendance_${selectedDate}_${userRole === 'superadmin' ? selectedDeptId : 'Team'}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="pb-10 font-lao">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <div className="flex items-center space-x-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
            <h1 className="text-3xl font-black tracking-tight text-white uppercase italic">
              {userRole === 'superadmin' ? 'ແຜງຄວບຄຸມລວມ (Super Admin)' : 'ແຜງຄວບຄຸມທີມງານ (Admin)'}
            </h1>
          </div>
          <p className="text-[11px] text-gray-400 uppercase tracking-widest mt-1">
            {userRole === 'superadmin'
              ? 'ຕິດຕາມການລົງເວລາ ແລະ ສະຖານະນັກສຶກສາທຸກພະແນກ'
              : `ຕິດຕາມການລົງເວລາສະເພາະທີມງານຂອງທ່ານ (${filteredInterns.length} ຄົນ)`}
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right hidden sm:block">
            <div className="text-xl font-mono font-bold text-white leading-none">{currentTime}</div>
            <div className="text-[9px] font-bold text-red-500 uppercase tracking-widest mt-1">Live Monitor</div>
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

      {/* Super Admin Department Filter */}
      {userRole === 'superadmin' && (
        <div className="mb-6 bg-[#161b22] border border-gray-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-gray-400">ເລືອກພະແນກ:</span>
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="bg-[#0b0e14] border border-gray-700 text-xs text-white rounded-xl px-4 py-2 focus:ring-1 focus:ring-red-500 outline-none"
            >
              <option value="all">ທຸກພະແນກ (All Departments)</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <span className="text-[11px] text-gray-400 font-mono">
            ສະແດງ {filteredInterns.length} ນັກສຶກສາ
          </span>
        </div>
      )}

      {/* 5 Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {/* Total Interns */}
        <Link href="/admin/interns" className="bg-[#161b22] border border-gray-800 rounded-2xl p-5 hover:border-red-500/40 transition-all group">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">ທີມງານທັງໝົດ</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-black text-white group-hover:text-red-500 transition-colors">{stats.total}</span>
            <span className="text-[10px] text-gray-400">ຄົນ</span>
          </div>
        </Link>

        {/* Present Today */}
        <div className="bg-[#161b22] border border-green-500/30 rounded-2xl p-5">
          <span className="text-[10px] text-green-400 font-bold uppercase tracking-wider">ມາວຽກມື້ນີ້</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-black text-green-400">{stats.present}</span>
            <span className="text-[10px] text-gray-400">ຄົນ</span>
          </div>
        </div>

        {/* Late Today */}
        <div className="bg-[#161b22] border border-red-500/30 rounded-2xl p-5">
          <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">
            ມາຊ້າ (ຫຼັງ {workStartCutoff})
          </span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-black text-red-400">{stats.late}</span>
            <span className="text-[10px] text-gray-400">ຄົນ</span>
          </div>
        </div>

        {/* On Leave Today */}
        <div className="bg-[#161b22] border border-amber-500/30 rounded-2xl p-5">
          <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">ລາວຽກ (Approved)</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-black text-amber-400">{stats.onLeave}</span>
            <span className="text-[10px] text-gray-400">ຄົນ</span>
          </div>
        </div>

        {/* Not Checked Out */}
        <div className="bg-[#161b22] border border-purple-500/30 rounded-2xl p-5 col-span-2 md:col-span-1">
          <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">ຍັງບໍ່ Check-out</span>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-3xl font-black text-purple-400">{stats.notCheckedOut}</span>
            <span className="text-[10px] text-gray-400">ຄົນ</span>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-[#161b22] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
        {/* Controls: Date Picker, Search & Export */}
        <div className="px-6 py-6 border-b border-gray-800 bg-white/[0.02] flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center">
              <span className="w-2 h-2 bg-red-600 rounded-full mr-2"></span>
              ຕາຕະລາງລົງເວລາປະຈຳວັນ
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              ກົດເລືອກວັນທີເພື່ອເບິ່ງປະຫວັດການລົງເວລາຍ້ອນຫຼັງ
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {/* Date Picker */}
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-[#0b0e14] border border-gray-700 text-xs text-white px-3 py-2 rounded-xl focus:ring-1 focus:ring-red-500 outline-none"
            />

            {/* Search Input */}
            <input
              type="text"
              placeholder="ຄົ້ນຫາຊື່ນັກສຶກສາ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#0b0e14] border border-gray-700 text-xs text-white px-4 py-2 rounded-xl focus:ring-1 focus:ring-red-500 outline-none flex-1 sm:w-60"
            />

            {/* Export Excel Button */}
            <button
              onClick={handleExportExcel}
              className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors flex items-center space-x-1.5 shadow-md"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] text-gray-400 uppercase tracking-widest bg-white/[0.03] border-b border-gray-800">
                <th className="px-6 py-4">ນັກສຶກສາ</th>
                <th className="px-6 py-4">ພະແນກ</th>
                <th className="px-6 py-4">ເຂົ້າວຽກ (Check-in)</th>
                <th className="px-6 py-4">ອອກວຽກ (Check-out)</th>
                <th className="px-6 py-4 text-center">ຊົ່ວໂມງສຸດທິ</th>
                <th className="px-6 py-4 text-center">ສະຖານະ</th>
                <th className="px-6 py-4 text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-gray-400 font-mono">
                    ກຳລັງໂຫຼດຂໍ້ມູນ...
                  </td>
                </tr>
              ) : tableRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-gray-400">
                    ບໍ່ມີຂໍ້ມູນນັກສຶກສາໃນທີມ
                  </td>
                </tr>
              ) : (
                tableRows.map((row) => (
                  <tr key={row.userId} className="hover:bg-white/[0.02] transition-colors">
                    {/* Intern Detail */}
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-xl bg-red-600/10 text-red-500 font-black flex items-center justify-center border border-red-500/20">
                          {row.fullname.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-white">{row.fullname}</div>
                          <div className="text-[10px] text-gray-400 font-mono">{row.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="px-6 py-4">
                      <span className="text-[11px] text-gray-300 font-medium">
                        {row.departmentName}
                      </span>
                    </td>

                    {/* Check In */}
                    <td className="px-6 py-4">
                      {row.attend?.checkInTime ? (
                        <div>
                          <div className="font-mono font-bold text-white">{row.checkInTimeStr}</div>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              row.checkInStatus === 'late'
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                : 'bg-green-500/10 text-green-400 border border-green-500/20'
                            }`}>
                              {row.checkInStatus === 'late' ? 'ມາຊ້າ' : 'ທັນເວລາ'}
                            </span>
                            {row.leave?.periods === 'morning' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                ລາເຄິ່ງເຊົ້າ
                              </span>
                            )}
                            <span className="text-[9px] text-gray-400 font-mono">({row.distance})</span>
                          </div>
                        </div>
                      ) : row.leave?.periods === 'morning' ? (
                        <span className="text-blue-400 text-[11px] font-medium">ລາເຄິ່ງເຊົ້າ (ລໍຖ້າແລງ)</span>
                      ) : row.leave && row.leave.periods !== 'afternoon' ? (
                        <span className="text-amber-400 text-[11px] font-medium">ລາວຽກເຕັມມື້</span>
                      ) : (
                        <span className="text-gray-400 text-[11px]">ຍັງບໍ່ Check-in</span>
                      )}
                    </td>

                    {/* Check Out */}
                    <td className="px-6 py-4">
                      {row.attend?.checkOutTime ? (
                        <div>
                          <div className="font-mono font-bold text-white">{row.checkOutTimeStr}</div>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              row.checkOutStatus === 'early-leave'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-green-500/10 text-green-400 border border-green-500/20'
                            }`}>
                              {row.checkOutStatus === 'early-leave' ? 'ອອກກ່ອນ (Early)' : 'ປົກກະຕິ'}
                            </span>
                            {row.leave?.periods === 'afternoon' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                ລາເຄິ່ງແລງ
                              </span>
                            )}
                          </div>
                        </div>
                      ) : row.leave?.periods === 'afternoon' ? (
                        <span className="text-blue-400 text-[11px] font-medium">ລາເຄິ່ງແລງ</span>
                      ) : row.leave && row.leave.periods !== 'morning' ? (
                        <span className="text-amber-400 text-[11px] font-medium">ລາວຽກເຕັມມື້</span>
                      ) : row.attend?.checkInTime ? (
                        row.checkOutStatus === 'forgot-checkout' ? (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                            ລືມ Check-out
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            ຍັງຢູ່ໃນເວລາວຽກ
                          </span>
                        )
                      ) : (
                        <span className="text-gray-400 text-[11px]">—</span>
                      )}
                    </td>

                    {/* Net Hours */}
                    <td className="px-6 py-4 text-center">
                      <span className="font-mono font-bold text-white">
                        {row.netHours > 0 ? `${row.netHours} ຊມ` : '—'}
                      </span>
                    </td>

                    {/* Overall Status */}
                    <td className="px-6 py-4 text-center">
                      {row.leave ? (
                        <div className="flex flex-col items-center gap-1">
                          {row.attend?.checkInTime ? (
                            <>
                              <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/30">
                                ມາວຽກ
                              </span>
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                {row.leave.periods === 'morning'
                                  ? 'ລາເຄິ່ງມື້ເຊົ້າ'
                                  : row.leave.periods === 'afternoon'
                                  ? 'ລາເຄິ່ງມື້ແລງ'
                                  : `ລາວຽກ (${row.leave.leaveTypeName || 'Approved'})`}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                ລາວຽກ ({row.leave.leaveTypeName || 'Approved'})
                              </span>
                              {row.leave.periods && row.leave.periods !== 'both' && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                  {row.leave.periods === 'morning' ? 'ລາເຄິ່ງມື້ເຊົ້າ' : 'ລາເຄິ່ງມື້ແລງ'}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      ) : row.attend?.checkInTime ? (
                        <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/30">
                          ມາວຽກ
                        </span>
                      ) : (
                        <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-gray-500/10 text-gray-400 border border-gray-500/20">
                          ຍັງບໍ່ລົງເວລາ
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/admin/interns/${row.userId}`}
                        className="inline-flex items-center space-x-1 text-xs font-bold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-600 px-3 py-1.5 rounded-lg border border-red-500/20 transition-all"
                      >
                        <span>ເບິ່ງໂປຣໄຟລ໌</span>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
