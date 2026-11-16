'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { LeaveRequest, LeaveType, UserProfile, Holiday, LeavePeriod } from '@/types';
import { countLeaveDays } from '@/lib/workdays';
import { getVientianeDateString, getServerNow } from '@/lib/attendance-rules';

export default function InternLeavePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [supervisorName, setSupervisorName] = useState<string>('ຫົວໜ້າທີມທີ່ຖືກມອບໝາຍ');
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Tabs: 'form' | 'pending' | 'approved' | 'rejected'
  const [activeTab, setActiveTab] = useState<'form' | 'pending' | 'approved' | 'rejected'>('form');

  // Form State
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [morningChecked, setMorningChecked] = useState<boolean>(true);
  const [afternoonChecked, setAfternoonChecked] = useState<boolean>(true);
  const [reason, setReason] = useState<string>('');

  // Attachment state
  const [attachmentFile, setAttachmentFile] = useState<{
    fileName: string;
    fileType: string;
    base64Data: string;
    sizeKb: number;
  } | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const todayStr = useMemo(() => getVientianeDateString(getServerNow()), []);

  useEffect(() => {
    let unsubscribeRequests: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/login');
        return;
      }

      try {
        // 1. Fetch current intern user profile
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const uData = { uid: user.uid, ...userDoc.data() } as UserProfile;
          setCurrentUser(uData);

          // Fetch supervisor name
          if (uData.supervisorId) {
            try {
              const sSnap = await getDoc(doc(db, 'users', uData.supervisorId));
              if (sSnap.exists()) {
                setSupervisorName(sSnap.data()?.fullname || 'ຫົວໜ້າທີມ');
              }
            } catch (sErr) {
              console.error('Error fetching supervisor:', sErr);
            }
          }
        }

        // 2. Fetch active leave types
        const ltSnap = await getDocs(collection(db, 'leave_types'));
        const typesList = ltSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as LeaveType))
          .filter(t => t.active !== false)
          .sort((a, b) => (a.order || 0) - (b.order || 0));

        setLeaveTypes(typesList);
        if (typesList.length > 0 && !selectedTypeId) {
          setSelectedTypeId(typesList[0].id);
        }

        // 3. Fetch Holidays
        const hSnap = await getDocs(collection(db, 'holidays'));
        setHolidays(hSnap.docs.map(d => ({ date: d.id, ...d.data() } as Holiday)));

        // 4. Real-time listener for intern's leave requests
        const qReq = query(
          collection(db, 'leave_requests'),
          where('userId', '==', user.uid)
        );

        unsubscribeRequests = onSnapshot(qReq, (snap) => {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest));
          list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          setRequests(list);
          setLoading(false);
        }, (err) => {
          console.error('Error loading requests:', err);
          setLoading(false);
        });

      } catch (err) {
        console.error('Initialization error:', err);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeRequests) unsubscribeRequests();
    };
  }, [router]);

  // Selected leave type object
  const selectedType = useMemo(() => {
    return leaveTypes.find(t => t.id === selectedTypeId) || leaveTypes[0] || null;
  }, [leaveTypes, selectedTypeId]);

  // Calculate periods
  const currentPeriods: LeavePeriod = useMemo(() => {
    if (startDate !== endDate) {
      return 'both';
    }
    if (morningChecked && afternoonChecked) return 'both';
    if (morningChecked) return 'morning';
    if (afternoonChecked) return 'afternoon';
    return 'both';
  }, [startDate, endDate, morningChecked, afternoonChecked]);

  // Live count of leave days
  const holidaysList = useMemo(() => holidays.map(h => h.date), [holidays]);
  const calculatedDays = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) return 0;
    return countLeaveDays(startDate, endDate, currentPeriods, holidaysList);
  }, [startDate, endDate, currentPeriods, holidaysList]);

  // Quota calculation for current intern
  const currentYear = useMemo(() => (startDate ? startDate.substring(0, 4) : todayStr.substring(0, 4)), [startDate, todayStr]);
  const currentMonth = useMemo(() => todayStr.substring(0, 7), [todayStr]); // YYYY-MM

  // Statistics per leave type (Annual & Monthly)
  const leaveStats = useMemo(() => {
    const map: Record<string, { usedInYear: number; usedInMonth: number; pendingInYear: number }> = {};

    leaveTypes.forEach(t => {
      map[t.id] = { usedInYear: 0, usedInMonth: 0, pendingInYear: 0 };
    });

    requests.forEach(r => {
      const tid = r.leaveTypeId || 'annual';
      if (!map[tid]) {
        map[tid] = { usedInYear: 0, usedInMonth: 0, pendingInYear: 0 };
      }

      const rYear = r.startDate?.substring(0, 4);
      const rMonth = r.startDate?.substring(0, 7);
      const daysCount = Number(r.days) || 1;

      if (r.status === 'approved') {
        if (rYear === currentYear) {
          map[tid].usedInYear += daysCount;
        }
        if (rMonth === currentMonth) {
          map[tid].usedInMonth += daysCount;
        }
      } else if (r.status === 'pending') {
        if (rYear === currentYear) {
          map[tid].pendingInYear += daysCount;
        }
      }
    });

    return map;
  }, [leaveTypes, requests, currentYear, currentMonth]);

  // Check if current form request exceeds remaining quota
  const quotaValidation = useMemo(() => {
    if (!selectedType || selectedType.quotaPerYear === null) {
      return { exceeds: false, message: null };
    }

    const typeStats = leaveStats[selectedType.id] || { usedInYear: 0, pendingInYear: 0 };
    const totalUsedOrPending = typeStats.usedInYear + typeStats.pendingInYear;
    const remaining = Math.max(0, selectedType.quotaPerYear - totalUsedOrPending);

    if (calculatedDays > remaining) {
      return {
        exceeds: true,
        message: `ໂຄຕ້າບໍ່ພຽງພໍ! ໂຄຕ້າທັງໝົດ: ${selectedType.quotaPerYear} ມື້/ປີ, ໃຊ້ແລ້ວ/ລໍຖ້າ: ${totalUsedOrPending} ມື້, ເຫຼືອ: ${remaining} ມື້ (ທ່ານກຳລັງຂໍ: ${calculatedDays} ມື້)`,
      };
    }

    return { exceeds: false, message: null };
  }, [selectedType, leaveStats, calculatedDays]);

  // Handle Image or PDF Selection & Compression
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      alert('ອະນຸຍາດສະເພາະໄຟລ໌ຮູບພາບ (JPG, PNG) ຫຼື PDF ເທົ່ານັ້ນ');
      return;
    }

    if (file.type === 'application/pdf') {
      if (file.size > 700 * 1024) {
        alert('ຂະໜາດໄຟລ໌ PDF ຕ້ອງບໍ່ເກີນ 700 KB');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setAttachmentFile({
          fileName: file.name,
          fileType: file.type,
          base64Data: reader.result as string,
          sizeKb: Math.round(file.size / 1024),
        });
      };
      reader.readAsDataURL(file);
    } else {
      // Compress image client-side using canvas
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1200;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Compress to JPEG 0.75
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
          const base64Clean = compressedDataUrl.split(',')[1] || '';
          const approxBytes = Math.round((base64Clean.length * 3) / 4);

          setAttachmentFile({
            fileName: file.name.replace(/\.[^/.]+$/, '') + '.jpg',
            fileType: 'image/jpeg',
            base64Data: compressedDataUrl,
            sizeKb: Math.round(approxBytes / 1024),
          });
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  // Reset Form
  const handleResetForm = () => {
    setStartDate('');
    setEndDate('');
    setMorningChecked(true);
    setAfternoonChecked(true);
    setReason('');
    setAttachmentFile(null);
    setFormError(null);
    setFormSuccess(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Submit Leave Request
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!startDate || !endDate || !reason.trim() || submitting) return;

    if (calculatedDays <= 0) {
      setFormError('ວັນທີທີ່ເລືອກເປັນວັນເສົາ-ອາທິດ ຫຼື ວັນພັກລັດຖະການທັງໝົດ (0 ມື້)');
      return;
    }

    if (quotaValidation.exceeds) {
      setFormError(quotaValidation.message || 'ໂຄຕ້າບໍ່ພຽງພໍ');
      return;
    }

    if (selectedType?.requiresDocument && !attachmentFile) {
      setFormError(`ການລາປະເພດ "${selectedType.name}" ບັງຄັບໃຫ້ແນບເອກະສານຢັ້ງຢືນ (ຮູບ/PDF)`);
      return;
    }

    try {
      setSubmitting(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication token missing');

      let uploadedAttachmentId: string | null = null;

      // 1. Upload attachment if attached
      if (attachmentFile) {
        setAttachmentUploading(true);
        const attachRes = await fetch('/api/leave/attachment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            fileName: attachmentFile.fileName,
            fileType: attachmentFile.fileType,
            base64Data: attachmentFile.base64Data,
          }),
        });

        const attachJson = await attachRes.json();
        if (!attachRes.ok) {
          throw new Error(attachJson.error || 'ອັບໂຫຼດເອກະສານແນບບໍ່ສຳເລັດ');
        }
        uploadedAttachmentId = attachJson.attachmentId;
      }

      // 2. Submit leave request
      const res = await fetch('/api/leave', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          leaveTypeId: selectedTypeId,
          startDate,
          endDate,
          periods: currentPeriods,
          reason,
          attachmentId: uploadedAttachmentId,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'ຍື່ນຄຳຂໍບໍ່ສຳເລັດ');
      }

      setFormSuccess('ຍື່ນຄຳຂໍລາພັກສຳເລັດແລ້ວ! ກະລຸນາລໍຖ້າການອະນຸມັດ');
      handleResetForm();
      setActiveTab('pending');
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || 'ເກີດຂໍ້ຜິດພາດໃນການຍື່ນຄຳຂໍ');
    } finally {
      setSubmitting(false);
      setAttachmentUploading(false);
    }
  };

  // Cancel Request
  const handleCancelRequest = async (requestId: string) => {
    if (!confirm('ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການຍົກເລີກຄຳຂໍລາພັກນີ້?')) return;

    try {
      setCancellingId(requestId);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/leave/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ requestId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'ຍົກເລີກບໍ່ສຳເລັດ');
      }
    } catch (err: any) {
      alert('ຂໍ້ຜິດພາດ: ' + err.message);
    } finally {
      setCancellingId(null);
    }
  };

  // Filtered requests by Tab
  const pendingRequests = useMemo(() => requests.filter(r => r.status === 'pending'), [requests]);
  const approvedRequests = useMemo(() => requests.filter(r => r.status === 'approved'), [requests]);
  const rejectedOrCancelledRequests = useMemo(() => requests.filter(r => r.status === 'rejected' || r.status === 'cancelled'), [requests]);

  return (
    <div className="space-y-6 font-lao pb-16 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
            <h1 className="text-2xl font-black text-white uppercase italic tracking-tight">
              ລະບົບຂໍລາພັກ (LTC Leave System)
            </h1>
          </div>
          <p className="text-[11px] text-gray-400 uppercase tracking-widest mt-0.5">
            Lao Telecom • Human Resources Leave Management
          </p>
        </div>
      </div>

      {/* 4 Tabs: Mobile-first pill navigation */}
      <div className="grid grid-cols-4 gap-1.5 p-1.5 bg-[#161b22] border border-gray-800 rounded-2xl">
        <button
          onClick={() => setActiveTab('form')}
          className={`py-2 text-xs font-black rounded-xl transition-all text-center ${
            activeTab === 'form'
              ? 'bg-red-600 text-white shadow-md shadow-red-900/30'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          ຂໍລາພັກ
        </button>

        <button
          onClick={() => setActiveTab('pending')}
          className={`py-2 text-xs font-black rounded-xl transition-all text-center relative ${
            activeTab === 'pending'
              ? 'bg-red-600 text-white shadow-md shadow-red-900/30'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <span>ລໍຖ້າ</span>
          {pendingRequests.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 bg-yellow-400 text-black text-[9px] font-black rounded-full">
              {pendingRequests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('approved')}
          className={`py-2 text-xs font-black rounded-xl transition-all text-center relative ${
            activeTab === 'approved'
              ? 'bg-red-600 text-white shadow-md shadow-red-900/30'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <span>ອະນຸມັດ</span>
          {approvedRequests.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 bg-green-500 text-white text-[9px] font-black rounded-full">
              {approvedRequests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('rejected')}
          className={`py-2 text-xs font-black rounded-xl transition-all text-center relative ${
            activeTab === 'rejected'
              ? 'bg-red-600 text-white shadow-md shadow-red-900/30'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <span>ບໍ່ອະນຸມັດ</span>
          {rejectedOrCancelledRequests.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 bg-gray-700 text-gray-300 text-[9px] font-black rounded-full">
              {rejectedOrCancelledRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* ══════════════ TAB 1: ຟອມຂໍລາພັກ ══════════════ */}
      {activeTab === 'form' && (
        <div className="space-y-6">
          <form onSubmit={handleSubmit} className="bg-[#161b22] border border-gray-800 rounded-3xl p-6 shadow-2xl space-y-5">
            {/* 1. ຜູ້ຂໍລາ & ຜູ້ອະນຸມັດ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-gray-800">
              {/* ຜູ້ຂໍລາ */}
              <div className="bg-[#0b0e14] border border-gray-800 rounded-2xl p-4">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                  👤 ຜູ້ຂໍລາພັກ
                </span>
                <div className="text-sm font-black text-white mt-1">
                  {currentUser?.fullname || 'ນັກສຶກສາ'}
                </div>
                <div className="text-[10px] text-red-400 font-mono mt-0.5">
                  ລະຫັດ: #{currentUser?.uid?.substring(0, 8)} • {currentUser?.email}
                </div>
              </div>

              {/* ຜູ້ອະນຸມັດ */}
              <div className="bg-[#0b0e14] border border-gray-800 rounded-2xl p-4">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                  ✍️ ຜູ້ມີສິດອະນຸມັດ (ອະນຸມັດຂັ້ນດຽວ)
                </span>
                <div className="text-xs font-bold text-gray-200 mt-1">
                  1. ຫົວໜ້າທີມ: <span className="text-white">{supervisorName}</span>
                </div>
                <div className="text-xs font-bold text-gray-400 mt-0.5">
                  2. <span className="text-red-400">HR / Super Admin</span> (ອະນຸມັດແທນໄດ້)
                </div>
              </div>
            </div>

            {/* 2. ປະເພດການລາພັກ */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-300 block">
                ປະເພດການລາພັກ <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedTypeId}
                onChange={(e) => setSelectedTypeId(e.target.value)}
                className="w-full bg-[#0b0e14] border border-gray-700 text-xs text-white rounded-xl px-4 py-3 outline-none focus:border-red-500 cursor-pointer"
              >
                {leaveTypes.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.quotaPerYear !== null ? `(ໂຄຕ້າ: ${t.quotaPerYear} ມື້/ປີ)` : '(ບໍ່ຈຳກັດໂຄຕ້າ)'} {t.requiresDocument ? '• ຕ້ອງມີເອກະສານ' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. ວັນທີເລີ່ມ - ວັນທີເຖິງ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-300 block">
                  ເລີ່ມລາວັນທີ <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  min={todayStr}
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (!endDate || e.target.value > endDate) {
                      setEndDate(e.target.value);
                    }
                  }}
                  required
                  className="w-full bg-[#0b0e14] border border-gray-700 text-xs text-white rounded-xl px-4 py-2.5 outline-none focus:border-red-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-300 block">
                  ເຖິງວັນທີ <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  min={startDate || todayStr}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className="w-full bg-[#0b0e14] border border-gray-700 text-xs text-white rounded-xl px-4 py-2.5 outline-none focus:border-red-500"
                />
              </div>
            </div>

            {/* 4. ຈຳນວນມື້ພັກທັງໝົດ (ສີແດງ ຄິດອັດຕະໂນມັດ) */}
            <div className="bg-[#0b0e14] border border-red-500/30 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-300 block">
                  ຈຳນວນມື້ພັກທັງໝົດ (ຫັກເສົາ-ອາທິດ & ວັນພັກ):
                </span>
                <span className="text-[10px] text-gray-500">
                  {startDate && endDate ? `${startDate} ຫາ ${endDate}` : 'ກະລຸນາເລືອກວັນທີ'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-red-500 font-mono">
                  {calculatedDays} ມື້
                </span>
              </div>
            </div>

            {/* 5. ຊ່ວງເວລາ (ຕ້ອງເລືອກຢ່າງໜ້ອຍ 1) */}
            <div className="space-y-2 bg-[#0b0e14] border border-gray-800 rounded-2xl p-4">
              <label className="text-xs font-bold text-gray-300 block">
                ຊ່ວງເວລາການລາ:
              </label>

              {startDate && endDate && startDate !== endDate ? (
                <div className="text-xs text-amber-400 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
                  ℹ️ ລາຫຼາຍມື້ ({calculatedDays} ມື້) ບັງຄັບເຕັມມື້ (ທັງຊ່ວງເຊົ້າ ແລະ ຊ່ວງແລງ)
                </div>
              ) : (
                <div className="flex items-center space-x-6">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={morningChecked}
                      onChange={(e) => {
                        if (!e.target.checked && !afternoonChecked) return;
                        setMorningChecked(e.target.checked);
                      }}
                      className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                    />
                    <span className="text-xs text-gray-200 font-bold">☑ ຊ່ວງເຊົ້າ</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={afternoonChecked}
                      onChange={(e) => {
                        if (!e.target.checked && !morningChecked) return;
                        setAfternoonChecked(e.target.checked);
                      }}
                      className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                    />
                    <span className="text-xs text-gray-200 font-bold">☑ ຊ່ວງແລງ</span>
                  </label>
                  <span className="text-[10px] text-gray-400">
                    ({!morningChecked || !afternoonChecked ? '0.5 ມື້' : '1.0 ມື້'})
                  </span>
                </div>
              )}
            </div>

            {/* 6. ເຫດຜົນ (ຕ້ອງໃສ່) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-300 block">
                ເຫດຜົນການລາພັກ <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                placeholder="ລະບຸເຫດຜົນລະອຽດ..."
                className="w-full bg-[#0b0e14] border border-gray-700 text-xs text-white p-3 rounded-xl outline-none focus:border-red-500"
              />
            </div>

            {/* 7. ເອກະສານແນບ (ຮູບ/PDF) */}
            <div className="space-y-2 bg-[#0b0e14] border border-gray-800 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-300">
                  ເອກະສານແນບ (ຮູບພາບ / PDF ≤ 700KB)
                  {selectedType?.requiresDocument && (
                    <span className="text-red-500 ml-1 font-black">* (ບັງຄັບ)</span>
                  )}
                </label>
                {attachmentFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="text-[10px] text-red-400 hover:underline"
                  >
                    ລຶບໄຟລ໌
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileChange}
                className="w-full text-xs text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-red-500/10 file:text-red-400 hover:file:bg-red-600 hover:file:text-white cursor-pointer"
              />

              {attachmentFile && (
                <div className="text-[11px] text-green-400 flex items-center space-x-2 pt-1 font-mono">
                  <span>📎 {attachmentFile.fileName}</span>
                  <span>({attachmentFile.sizeKb} KB)</span>
                </div>
              )}
            </div>

            {/* Messages */}
            {formError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl font-bold">
                ⚠️ {formError}
              </div>
            )}
            {formSuccess && (
              <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-xs p-3 rounded-xl font-bold">
                ✅ {formSuccess}
              </div>
            )}

            {/* 8. ປຸ່ມ ລາພັກ (ຂຽວ) ແລະ ຍ້ອນກັບ (ແດງ) */}
            <div className="flex items-center space-x-3 pt-2">
              <button
                type="submit"
                disabled={submitting || calculatedDays <= 0 || quotaValidation.exceeds}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-black py-3.5 rounded-2xl transition-all shadow-lg shadow-green-900/30 flex items-center justify-center space-x-2"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>ກຳລັງຍື່ນຄຳຂໍ...</span>
                  </>
                ) : (
                  <span>ລາພັກ ({calculatedDays} ມື້)</span>
                )}
              </button>

              <button
                type="button"
                onClick={handleResetForm}
                className="bg-red-600/10 hover:bg-red-600 border border-red-500/20 hover:border-red-600 text-red-400 hover:text-white text-xs font-black px-6 py-3.5 rounded-2xl transition-all"
              >
                ຍ້ອນກັບ / ລ້າງຟອມ
              </button>
            </div>
          </form>

          {/* ══════════════ 2 ຕາຕະລາງສະຫຼຸບໂຄຕ້າ ══════════════ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* ຕາຕະລາງ 1: ລາຍການລາພັກ ປະຈຳເດືອນ */}
            <div className="bg-[#161b22] border border-gray-800 rounded-3xl p-5 shadow-xl">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-black text-gray-200 uppercase tracking-wider flex items-center">
                  <span className="w-2 h-2 bg-red-600 rounded-full mr-2"></span>
                  ລາຍການລາພັກ ປະຈຳເດືອນ ({currentMonth})
                </h3>
                <span className="text-[10px] text-green-400 font-bold bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                  Approved
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="text-[10px] text-gray-400 uppercase tracking-wider border-b border-gray-800">
                      <th className="py-2 px-3">ລ/ດ</th>
                      <th className="py-2 px-3">ປະເພດການລາ</th>
                      <th className="py-2 px-3 text-right">ໃຊ້ໃນເດືອນນີ້</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {leaveTypes.map((lt, idx) => (
                      <tr key={lt.id} className="hover:bg-white/[0.02]">
                        <td className="py-2.5 px-3 text-gray-400 font-mono">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-gray-200">{lt.name}</td>
                        <td className="py-2.5 px-3 text-right font-black font-mono text-green-400">
                          {leaveStats[lt.id]?.usedInMonth || 0} ມື້
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ຕາຕະລາງ 2: ລາຍການລາພັກ ປະຈຳປີ */}
            <div className="bg-[#161b22] border border-gray-800 rounded-3xl p-5 shadow-xl">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-black text-gray-200 uppercase tracking-wider flex items-center">
                  <span className="w-2 h-2 bg-red-600 rounded-full mr-2"></span>
                  ລາຍການລາພັກ ປະຈຳປີ ({currentYear})
                </h3>
                <span className="text-[10px] text-gray-400 font-bold bg-gray-800 px-2 py-0.5 rounded-full">
                  Approved + Pending
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="text-[10px] text-gray-400 uppercase tracking-wider border-b border-gray-800">
                      <th className="py-2 px-3">ລ/ດ</th>
                      <th className="py-2 px-3">ປະເພດການລາ</th>
                      <th className="py-2 px-3 text-right">ໃຊ້ແລ້ວ / ໂຄຕ້າ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {leaveTypes.map((lt, idx) => {
                      const totalUsed = (leaveStats[lt.id]?.usedInYear || 0) + (leaveStats[lt.id]?.pendingInYear || 0);
                      const quotaLabel = lt.quotaPerYear !== null ? `${totalUsed} / ${lt.quotaPerYear} ມື້` : `${totalUsed} / ບໍ່ຈຳກັດ`;
                      return (
                        <tr key={lt.id} className="hover:bg-white/[0.02]">
                          <td className="py-2.5 px-3 text-gray-400 font-mono">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-bold text-gray-200">{lt.name}</td>
                          <td className="py-2.5 px-3 text-right font-black font-mono text-white">
                            {quotaLabel}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ TAB 2: ລໍຖ້າ (Pending) ══════════════ */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          {pendingRequests.length === 0 ? (
            <div className="bg-[#161b22] border border-gray-800 rounded-3xl p-12 text-center text-gray-500 text-xs">
              ບໍ່ມີຄຳຂໍລາພັກທີ່ກຳລັງລໍຖ້າການອະນຸມັດ
            </div>
          ) : (
            pendingRequests.map((req) => (
              <div
                key={req.id}
                className="bg-[#161b22] border border-gray-800 rounded-3xl p-5 shadow-xl space-y-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-sm font-black text-white">
                      {req.leaveTypeName || 'ລາພັກ'}
                    </span>
                    <div className="text-xs text-gray-300 font-mono mt-0.5">
                      📅 {req.startDate} ຫາ {req.endDate} ({req.days} ມື້)
                      {req.periods && req.periods !== 'both' && (
                        <span className="text-amber-400 ml-1">
                          • {req.periods === 'morning' ? 'ຊ່ວງເຊົ້າ' : 'ຊ່ວງແລງ'}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                    ⏳ ລໍຖ້າອະນຸມັດ
                  </span>
                </div>

                <div className="bg-[#0b0e14] p-3 rounded-xl border border-gray-800 text-xs text-gray-300">
                  <p className="italic">&ldquo;{req.reason}&rdquo;</p>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-gray-500 font-mono">
                    ຍື່ນເມື່ອ: {req.createdAt?.substring(0, 10)}
                  </span>

                  <button
                    onClick={() => handleCancelRequest(req.id)}
                    disabled={cancellingId === req.id}
                    className="text-xs font-bold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-600 px-3 py-1.5 rounded-xl border border-red-500/20 transition-all disabled:opacity-50"
                  >
                    {cancellingId === req.id ? 'ກຳລັງຍົກເລີກ...' : 'ຍົກເລີກຄຳຂໍ'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ══════════════ TAB 3: ອະນຸມັດ (Approved) ══════════════ */}
      {activeTab === 'approved' && (
        <div className="space-y-4">
          {approvedRequests.length === 0 ? (
            <div className="bg-[#161b22] border border-gray-800 rounded-3xl p-12 text-center text-gray-500 text-xs">
              ຍັງບໍ່ມີຄຳຂໍລາພັກທີ່ໄດ້ຮັບການອະນຸມັດ
            </div>
          ) : (
            approvedRequests.map((req) => (
              <div
                key={req.id}
                className="bg-[#161b22] border border-gray-800 rounded-3xl p-5 shadow-xl space-y-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-sm font-black text-white">
                      {req.leaveTypeName || 'ລາພັກ'}
                    </span>
                    <div className="text-xs text-gray-300 font-mono mt-0.5">
                      📅 {req.startDate} ຫາ {req.endDate} ({req.days} ມື້)
                      {req.periods && req.periods !== 'both' && (
                        <span className="text-amber-400 ml-1">
                          • {req.periods === 'morning' ? 'ຊ່ວງເຊົ້າ' : 'ຊ່ວງແລງ'}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                    ✅ ອະນຸມັດແລ້ວ
                  </span>
                </div>

                <div className="bg-[#0b0e14] p-3 rounded-xl border border-gray-800 text-xs text-gray-300">
                  <p className="italic">&ldquo;{req.reason}&rdquo;</p>
                </div>

                {req.reviewedBy && (
                  <div className="text-[10px] text-gray-400 font-mono pt-1">
                    ອະນຸມັດໂດຍ: {req.reviewedByName || req.reviewedBy} • ເມື່ອ {req.reviewedAt?.substring(0, 10)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ══════════════ TAB 4: ບໍ່ອະນຸມັດ (Rejected + Cancelled) ══════════════ */}
      {activeTab === 'rejected' && (
        <div className="space-y-4">
          {rejectedOrCancelledRequests.length === 0 ? (
            <div className="bg-[#161b22] border border-gray-800 rounded-3xl p-12 text-center text-gray-500 text-xs">
              ບໍ່ມີລາຍການທີ່ຖືກປະຕິເສດ ຫຼື ຍົກເລີກ
            </div>
          ) : (
            rejectedOrCancelledRequests.map((req) => (
              <div
                key={req.id}
                className="bg-[#161b22] border border-gray-800 rounded-3xl p-5 shadow-xl space-y-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-sm font-black text-white">
                      {req.leaveTypeName || 'ລາພັກ'}
                    </span>
                    <div className="text-xs text-gray-300 font-mono mt-0.5">
                      📅 {req.startDate} ຫາ {req.endDate} ({req.days} ມື້)
                    </div>
                  </div>

                  <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
                    req.status === 'rejected'
                      ? 'bg-red-500/10 text-red-400 border-red-500/30'
                      : 'bg-gray-800 text-gray-400 border-gray-700'
                  }`}>
                    {req.status === 'rejected' ? '❌ ຖືກປະຕິເສດ' : '⚪ ຍົກເລີກແລ້ວ'}
                  </span>
                </div>

                <div className="bg-[#0b0e14] p-3 rounded-xl border border-gray-800 text-xs text-gray-300">
                  <p className="italic">&ldquo;{req.reason}&rdquo;</p>
                </div>

                {req.reviewNote && (
                  <div className="text-xs text-red-400 bg-red-500/5 p-2.5 rounded-xl border border-red-500/20">
                    <span className="font-bold">ເຫດຜົນຈາກຜູ້ກວດກາ:</span> {req.reviewNote}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
