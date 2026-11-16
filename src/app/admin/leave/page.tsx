'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { LeaveRequest, LeaveType, UserProfile, Department } from '@/types';

export default function AdminLeaveManagementPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'superadmin' | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [interns, setInterns] = useState<UserProfile[]>([]);

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  // Attachment Modal
  const [viewingAttachment, setViewingAttachment] = useState<{
    fileName: string;
    fileType: string;
    base64Data: string;
  } | null>(null);
  const [loadingAttachment, setLoadingAttachment] = useState(false);

  useEffect(() => {
    let unsubscribeRequests: (() => void) | undefined;
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

        // Fetch departments
        if (role === 'superadmin') {
          const deptsSnap = await getDocs(collection(db, 'departments'));
          setDepartments(deptsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
        }

        // Fetch leave types
        const ltSnap = await getDocs(collection(db, 'leave_types'));
        setLeaveTypes(ltSnap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveType)));

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
        });

        // Fetch leave requests scoped
        let qRequests;
        if (role === 'superadmin') {
          qRequests = query(collection(db, 'leave_requests'));
        } else {
          qRequests = query(
            collection(db, 'leave_requests'),
            where('supervisorId', '==', user.uid)
          );
        }

        unsubscribeRequests = onSnapshot(qRequests, (snapshot) => {
          const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest));
          list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          setRequests(list);
          setLoading(false);
        }, (err) => {
          console.error('Leave requests error:', err);
          setLoading(false);
        });

      } catch (err) {
        console.error('Leave page init error:', err);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeRequests) unsubscribeRequests();
      if (unsubscribeInterns) unsubscribeInterns();
    };
  }, [router]);

  const internMap = useMemo(() => {
    const map: Record<string, UserProfile> = {};
    interns.forEach(i => {
      map[i.uid] = i;
    });
    return map;
  }, [interns]);

  const leaveTypeMap = useMemo(() => {
    const map: Record<string, LeaveType> = {};
    leaveTypes.forEach(t => {
      map[t.id] = t;
    });
    return map;
  }, [leaveTypes]);

  // Quota map per intern
  const internQuotaUsage = useMemo(() => {
    const usage: Record<string, Record<string, number>> = {}; // internId -> leaveTypeId -> usedDays

    requests.forEach(r => {
      if (r.status === 'approved' || r.status === 'pending') {
        const uid = r.userId;
        const tid = r.leaveTypeId || 'annual';
        if (!usage[uid]) usage[uid] = {};
        if (!usage[uid][tid]) usage[uid][tid] = 0;
        usage[uid][tid] += Number(r.days) || 1;
      }
    });

    return usage;
  }, [requests]);

  // Handle Review (Approve / Reject / Revoke)
  const handleReviewAction = async (requestId: string, action: 'approve' | 'reject' | 'revoke') => {
    let reviewNote = '';

    if (action === 'reject') {
      const input = prompt('ກະລຸນາໃສ່ເຫດຜົນໃນການປະຕິເສດ:');
      if (input === null) return;
      reviewNote = input;
    } else if (action === 'revoke') {
      const input = prompt('ກະລຸນາໃສ່ເຫດຜົນໃນການຍົກເລີກການອະນຸມັດ (Mandatory):');
      if (!input || !input.trim()) {
        alert('ທ່ານຕ້ອງລະບຸເຫດຜົນໃນການຍົກເລີກ');
        return;
      }
      reviewNote = input.trim();
    } else {
      const input = prompt('ໃສ່ຄຳແນະນຳ/ໝາຍເຫດ (ຖ້າມີ):', 'ອະນຸມັດ');
      if (input === null) return;
      reviewNote = input;
    }

    try {
      setActionLoading(requestId);
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const res = await fetch('/api/leave/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requestId,
          action,
          reviewNote,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'ດຳເນີນການບໍ່ສຳເລັດ');
      }

      alert(resJson.message || 'ດຳເນີນການສຳເລັດ!');
    } catch (err: any) {
      alert('ຂໍ້ຜິດພາດ: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // View Attachment
  const handleViewAttachment = async (attachmentId: string) => {
    try {
      setLoadingAttachment(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const res = await fetch(`/api/leave/attachment?id=${attachmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'ບໍ່ສາມາດເປີດເອກະສານແນບໄດ້');
      }

      setViewingAttachment(data);
    } catch (err: any) {
      alert('ຂໍ້ຜິດພາດ: ' + err.message);
    } finally {
      setLoadingAttachment(false);
    }
  };

  // Filtered requests by Tab & Department
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      // Department filter for superadmin
      if (userRole === 'superadmin' && selectedDeptId !== 'all') {
        const internProfile = internMap[r.userId];
        if (internProfile?.departmentId !== selectedDeptId) return false;
      }

      if (activeTab === 'pending') return r.status === 'pending';
      if (activeTab === 'approved') return r.status === 'approved';
      if (activeTab === 'rejected') return r.status === 'rejected' || r.status === 'cancelled';
      return true;
    });
  }, [requests, userRole, selectedDeptId, activeTab, internMap]);

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-8 font-lao pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-6">
        <div>
          <div className="flex items-center space-x-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
            <h1 className="text-3xl font-black text-white uppercase italic tracking-tight">
              {userRole === 'superadmin' ? 'ອະນຸມັດການລາພັກ (Super Admin)' : 'ອະນຸມັດການລາພັກທີມງານ (Admin)'}
            </h1>
          </div>
          <p className="text-[11px] text-gray-400 uppercase tracking-widest mt-1">
            {userRole === 'superadmin'
              ? 'ກວດສອບ ແລະ ອະນຸມັດຄຳຂໍລາພັກຂອງນັກສຶກສາທຸກພະແນກ'
              : `ກວດສອບຄຳຂໍລາພັກສະເພາະນັກສຶກສາໃນທີມຂອງທ່ານ (${interns.length} ຄົນ)`}
          </p>
        </div>

        {userRole === 'superadmin' && (
          <select
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            className="bg-[#161b22] border border-gray-800 text-xs text-white px-4 py-2.5 rounded-xl outline-none focus:ring-1 focus:ring-red-500"
          >
            <option value="all">ທຸກພະແນກ (All Departments)</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-gray-800 pb-3">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
            activeTab === 'pending'
              ? 'bg-red-600 text-white shadow-lg shadow-red-900/30'
              : 'text-gray-400 hover:text-white bg-[#161b22] border border-gray-800'
          }`}
        >
          <span>ລໍຖ້າອະນຸມັດ</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-white text-red-600">
              {pendingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('approved')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'approved'
              ? 'bg-red-600 text-white shadow-lg shadow-red-900/30'
              : 'text-gray-400 hover:text-white bg-[#161b22] border border-gray-800'
          }`}
        >
          ອະນຸມັດແລ້ວ
        </button>

        <button
          onClick={() => setActiveTab('rejected')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'rejected'
              ? 'bg-red-600 text-white shadow-lg shadow-red-900/30'
              : 'text-gray-400 hover:text-white bg-[#161b22] border border-gray-800'
          }`}
        >
          ປະຕິເສດ / ຍົກເລີກ
        </button>

        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'all'
              ? 'bg-red-600 text-white shadow-lg shadow-red-900/30'
              : 'text-gray-400 hover:text-white bg-[#161b22] border border-gray-800'
          }`}
        >
          ທັງໝົດ
        </button>
      </div>

      {/* Requests List */}
      <div className="space-y-4">
        {loading ? (
          <div className="py-20 text-center text-gray-500 font-mono text-xs">
            ກຳລັງໂຫຼດລາຍການຄຳຂໍລາພັກ...
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="bg-[#161b22] border border-gray-800 rounded-3xl p-16 text-center text-gray-500 text-xs">
            ບໍ່ມີລາຍການຄຳຂໍລາພັກໃນໝວດນີ້
          </div>
        ) : (
          filteredRequests.map((req) => {
            const internProfile = internMap[req.userId];
            const typeInfo = req.leaveTypeId ? leaveTypeMap[req.leaveTypeId] : null;
            const quotaTotal = typeInfo?.quotaPerYear;
            const quotaUsed = internQuotaUsage[req.userId]?.[req.leaveTypeId || 'annual'] || 0;
            const quotaRemaining = quotaTotal !== null && quotaTotal !== undefined ? Math.max(0, quotaTotal - quotaUsed) : null;

            return (
              <div
                key={req.id}
                className="bg-[#161b22] border border-gray-800 rounded-3xl p-6 shadow-xl space-y-4 hover:border-gray-700 transition-all"
              >
                {/* Header Info */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-red-600/10 text-red-500 font-black flex items-center justify-center border border-red-500/20">
                      {req.userName?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-sm">
                          {req.userName || internProfile?.fullname || '—'}
                        </span>
                        <span className="text-[10px] text-gray-400 bg-gray-800 px-2 py-0.5 rounded-md font-mono">
                          #{req.userId.substring(0, 8)}
                        </span>
                      </div>
                      <div className="text-[11px] text-red-400 font-bold mt-0.5">
                        {req.leaveTypeName || 'ລາພັກ'} • {req.days || 1} ມື້
                        {req.periods && req.periods !== 'both' && (
                          <span className="text-amber-400 ml-1">
                            ({req.periods === 'morning' ? 'ຊ່ວງເຊົ້າ' : 'ຊ່ວງແລງ'})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
                    <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${
                      req.status === 'approved'
                        ? 'bg-green-500/10 text-green-400 border-green-500/30'
                        : req.status === 'pending'
                        ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                        : 'bg-red-500/10 text-red-400 border-red-500/30'
                    }`}>
                      {req.status === 'approved'
                        ? '✅ ອະນຸມັດແລ້ວ'
                        : req.status === 'pending'
                        ? '⏳ ລໍຖ້າອະນຸມັດ'
                        : req.status === 'rejected'
                        ? '❌ ຖືກປະຕິເສດ'
                        : '⚪ ຍົກເລີກແລ້ວ'}
                    </span>
                  </div>
                </div>

                {/* Date & Quota Box */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#0b0e14] p-3 rounded-2xl border border-gray-800">
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase block font-bold">ວັນທີລາພັກ:</span>
                    <span className="font-mono text-white font-bold">
                      {req.startDate} ຫາ {req.endDate}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-gray-500 uppercase block font-bold">ໂຄຕ້າທີ່ເຫຼືອຂອງ Intern:</span>
                    <span className="font-mono text-gray-200">
                      {quotaTotal !== null && quotaTotal !== undefined
                        ? `ເຫຼືອ ${quotaRemaining} / ${quotaTotal} ມື້/ປີ`
                        : 'ບໍ່ຈຳກັດໂຄຕ້າ'}
                    </span>
                  </div>
                </div>

                {/* Reason */}
                <div className="bg-[#0b0e14] p-3.5 rounded-2xl border border-gray-800 text-xs text-gray-300">
                  <span className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                    ເຫດຜົນການລາ:
                  </span>
                  <p className="italic">&ldquo;{req.reason}&rdquo;</p>
                </div>

                {/* Attachment Button */}
                {req.hasAttachment && req.attachmentId && (
                  <div>
                    <button
                      type="button"
                      onClick={() => handleViewAttachment(req.attachmentId!)}
                      className="text-xs font-bold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-600 px-3 py-1.5 rounded-xl border border-red-500/20 transition-all flex items-center space-x-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      <span>ເບິ່ງເອກະສານແນບ (Attachment)</span>
                    </button>
                  </div>
                )}

                {/* Review Notes / Rejection / Revoke Info */}
                {req.reviewNote && (
                  <div className="text-xs text-amber-400 bg-amber-500/5 p-3 rounded-xl border border-amber-500/20">
                    <span className="font-bold">ໝາຍເຫດ/ເຫດຜົນຈາກຜູ້ກວດກາ:</span> {req.reviewNote}
                  </div>
                )}

                {/* Actions Row */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-gray-800">
                  <span className="text-[10px] text-gray-500 font-mono">
                    ຍື່ນເມື່ອ: {req.createdAt?.substring(0, 16)}
                  </span>

                  <div className="flex items-center space-x-2 w-full sm:w-auto">
                    {req.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleReviewAction(req.id, 'reject')}
                          disabled={actionLoading === req.id}
                          className="flex-1 sm:flex-initial text-xs font-bold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-600 px-4 py-2 rounded-xl border border-red-500/20 transition-all disabled:opacity-50"
                        >
                          {actionLoading === req.id ? '...' : 'ປະຕິເສດ'}
                        </button>

                        <button
                          onClick={() => handleReviewAction(req.id, 'approve')}
                          disabled={actionLoading === req.id}
                          className="flex-1 sm:flex-initial text-xs font-bold text-white bg-green-600 hover:bg-green-700 px-4 py-2 rounded-xl transition-all shadow-md shadow-green-900/30 disabled:opacity-50"
                        >
                          {actionLoading === req.id ? 'ກຳລັງບັນທຶກ...' : 'ອະນຸມັດ'}
                        </button>
                      </>
                    )}

                    {req.status === 'approved' && (
                      <button
                        onClick={() => handleReviewAction(req.id, 'revoke')}
                        disabled={actionLoading === req.id}
                        className="text-xs font-bold text-amber-400 hover:text-white bg-amber-500/10 hover:bg-amber-600 px-3.5 py-1.5 rounded-xl border border-amber-500/20 transition-all disabled:opacity-50"
                      >
                        {actionLoading === req.id ? 'ກຳລັງຍົກເລີກ...' : 'ຍົກເລີກການອະນຸມັດ (Revoke)'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Attachment Preview Modal */}
      {viewingAttachment && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-gray-800 rounded-3xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">{viewingAttachment.fileName}</h3>
                <span className="text-[10px] text-gray-500 font-mono">
                  {(viewingAttachment.fileType || '').toUpperCase()}
                </span>
              </div>
              <button
                onClick={() => setViewingAttachment(null)}
                className="text-gray-400 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-[#0b0e14] rounded-2xl">
              {viewingAttachment.fileType.startsWith('image/') ? (
                <img
                  src={viewingAttachment.base64Data}
                  alt={viewingAttachment.fileName}
                  className="max-h-[60vh] max-w-full object-contain rounded-lg"
                />
              ) : (
                <iframe
                  src={viewingAttachment.base64Data}
                  className="w-full h-[60vh] rounded-lg"
                  title="PDF Preview"
                />
              )}
            </div>

            <div className="text-right">
              <button
                onClick={() => setViewingAttachment(null)}
                className="bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold px-4 py-2 rounded-xl"
              >
                ປິດ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
