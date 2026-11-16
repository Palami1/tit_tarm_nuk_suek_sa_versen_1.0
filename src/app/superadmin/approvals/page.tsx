'use client';

import React, { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { Department, UserProfile } from '@/types';

interface AdminOption {
  uid: string;
  fullname: string;
  email: string;
  departmentId?: string | null;
  role: string;
}

export default function SuperAdminApprovalsPage() {
  const [interns, setInterns] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [admins, setAdmins] = useState<AdminOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'other' | 'all'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Assignment state per intern: { [internId]: { departmentId, supervisorId } }
  const [assignments, setAssignments] = useState<Record<string, { departmentId: string; supervisorId: string }>>({});

  // Quick department modal
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [creatingDept, setCreatingDept] = useState(false);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const token = await currentUser.getIdToken();
      const res = await fetch('/api/superadmin/approvals', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch approvals data (${res.status})`);
      }

      const data = await res.json();
      setInterns(data.interns || []);
      setDepartments(data.departments || []);
      setAdmins(data.admins || []);

      // Initialize assignments map
      const initialMap: Record<string, { departmentId: string; supervisorId: string }> = {};
      (data.interns || []).forEach((i: UserProfile) => {
        initialMap[i.uid] = {
          departmentId: i.departmentId || '',
          supervisorId: i.supervisorId || '',
        };
      });
      setAssignments(initialMap);
    } catch (err: any) {
      console.error(err);
      alert('ເກີດຂໍ້ຜິດພາດໃນການໂຫຼດຂໍ້ມູນ: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const handleAssignmentChange = (internId: string, field: 'departmentId' | 'supervisorId', val: string) => {
    setAssignments(prev => ({
      ...prev,
      [internId]: {
        ...prev[internId],
        [field]: val,
      },
    }));
  };

  const handleAction = async (internId: string, action: 'approve' | 'reject' | 'suspend' | 'activate' | 'reassign') => {
    try {
      setActionLoading(internId);
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const token = await currentUser.getIdToken();
      const targetAssign = assignments[internId] || { departmentId: '', supervisorId: '' };

      let reason = '';
      if (action === 'reject') {
        const inputReason = prompt('ກະລຸນາໃສ່ເຫດຜົນໃນການປະຕິເສດ:');
        if (inputReason === null) {
          setActionLoading(null);
          return;
        }
        reason = inputReason;
      } else if (action === 'suspend') {
        const inputReason = prompt('ກະລຸນາໃສ່ເຫດຜົນໃນການລະງັບບັນຊີ:');
        if (inputReason === null) {
          setActionLoading(null);
          return;
        }
        reason = inputReason;
      }

      const res = await fetch('/api/superadmin/approvals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          internId,
          action,
          departmentId: targetAssign.departmentId || null,
          supervisorId: targetAssign.supervisorId || null,
          reason,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'ການດຳເນີນການບໍ່ສຳເລັດ');
      }

      alert(resJson.message || 'ດຳເນີນການສຳເລັດ');
      await fetchAllData();
    } catch (err: any) {
      console.error(err);
      alert('ຂໍ້ຜິດພາດ: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;

    try {
      setCreatingDept(true);
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const token = await currentUser.getIdToken();

      const res = await fetch('/api/superadmin/departments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newDeptName.trim() }),
      });

      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error || 'ບໍ່ສາມາດສ້າງພະແນກໄດ້');

      alert('ສ້າງພະແນກໃໝ່ສຳເລັດ');
      setNewDeptName('');
      setShowDeptModal(false);
      await fetchAllData();
    } catch (err: any) {
      console.error(err);
      alert('ຂໍ້ຜິດພາດ: ' + err.message);
    } finally {
      setCreatingDept(false);
    }
  };

  // Filtered List
  const filteredInterns = interns.filter((i) => {
    const matchesSearch =
      i.fullname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.college?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.major?.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (activeTab === 'pending') return i.status === 'pending';
    if (activeTab === 'approved') return i.status === 'approved';
    if (activeTab === 'other') return i.status === 'rejected' || i.status === 'suspended';
    return true; // 'all'
  });

  const pendingCount = interns.filter(i => i.status === 'pending').length;
  const approvedCount = interns.filter(i => i.status === 'approved').length;
  const otherCount = interns.filter(i => i.status === 'rejected' || i.status === 'suspended').length;

  return (
    <div className="space-y-8 font-lao">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <span className="px-3 py-1 bg-red-950/60 text-red-400 border border-red-800/60 rounded-full text-xs font-bold uppercase tracking-wider">
              Super Admin Control
            </span>
          </div>
          <h1 className="text-3xl font-black text-white mt-2 tracking-tight">
            ຈັດການ ແລະ ອະນຸມັດ Intern ໃໝ່
          </h1>
          <p className="text-gray-400 text-xs mt-1">
            ກວດສອບຄຳຂໍສະໝັກ, ອະນຸມັດ/ປະຕິເສດ, ກຳນົດພະແນກ ແລະ ມອບໝາຍຫົວໜ້າທີມ (Supervisor)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDeptModal(true)}
            className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-bold border border-gray-700 transition-all flex items-center gap-2"
          >
            <span>🏢</span>
            <span>+ ເພີ່ມພະແນກໃໝ່</span>
          </button>
          <button
            onClick={fetchAllData}
            className="p-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs border border-gray-700 transition-all"
            title="Reload Data"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        <div className="flex bg-gray-900/80 p-1 rounded-2xl border border-gray-800 self-start">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'pending'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span>⏳ ລໍຖ້າອະນຸມັດ</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500 text-black font-extrabold">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('approved')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'approved'
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span>✅ ອະນຸມັດແລ້ວ</span>
            <span className="text-[10px] text-gray-400">({approvedCount})</span>
          </button>
          <button
            onClick={() => setActiveTab('other')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'other'
                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span>🔒 ລະງັບ/ປະຕິເສດ</span>
            <span className="text-[10px] text-gray-400">({otherCount})</span>
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'all'
                ? 'bg-gray-800 text-white border border-gray-700'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            ທັງໝົດ ({interns.length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            placeholder="ຄົ້ນຫາຊື່, ອີເມວ, ມະຫາວິທະຍາໄລ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:w-80 px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
          />
        </div>
      </div>

      {/* Main Table / Cards */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-xs">ກຳລັງດຶງຂໍ້ມູນ...</p>
        </div>
      ) : filteredInterns.length === 0 ? (
        <div className="py-16 text-center bg-gray-900/40 rounded-3xl border border-gray-800">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-gray-400 font-bold text-sm">ບໍ່ມີລາຍການໃນໝວດໝູ່ນີ້</p>
          <p className="text-gray-600 text-xs mt-1">ບໍ່ພົບຂໍ້ມູນນັກສຶກສາທີ່ກົງກັບເງື່ອນໄຂການຄົ້ນຫາ</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredInterns.map((intern) => {
            const currentAssign = assignments[intern.uid] || { departmentId: '', supervisorId: '' };
            const isPending = intern.status === 'pending';
            const isApproved = intern.status === 'approved';
            const isSuspended = intern.status === 'suspended';
            const isRejected = intern.status === 'rejected';
            const isLoadingThis = actionLoading === intern.uid;

            return (
              <div
                key={intern.uid}
                className="bg-[#161b22] border border-gray-800/80 rounded-2xl p-5 hover:border-gray-700 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-6"
              >
                {/* Column 1: Intern Info */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-base font-black text-white">{intern.fullname}</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                        isPending
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : isApproved
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : isSuspended
                          ? 'bg-gray-700 text-gray-300'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}
                    >
                      {intern.status?.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-400">
                    <div>
                      <span className="text-gray-500">ອີເມວ:</span> {intern.email}
                    </div>
                    <div>
                      <span className="text-gray-500">ເບີໂທ:</span> {intern.phone || '—'}
                    </div>
                    <div>
                      <span className="text-gray-500">ມະຫາວິທະຍາໄລ:</span> {intern.college || '—'}
                    </div>
                    <div>
                      <span className="text-gray-500">ສາຂາ:</span> {intern.major || '—'}
                    </div>
                    <div>
                      <span className="text-gray-500">ໄລຍະຝຶກງານ:</span>{' '}
                      {intern.startDate ? `${intern.startDate} ຫາ ${intern.endDate || '—'}` : 'ບໍ່ໄດ້ລະບຸ'}
                    </div>
                  </div>
                </div>

                {/* Column 2: Department & Supervisor Selectors */}
                <div className="flex flex-col sm:flex-row gap-3 min-w-[320px]">
                  {/* Department Selector */}
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-gray-400 mb-1">
                      🏢 ພະແນກຝຶກງານ:
                    </label>
                    <select
                      value={currentAssign.departmentId}
                      onChange={(e) => handleAssignmentChange(intern.uid, 'departmentId', e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                    >
                      <option value="">-- ເລືອກພະແນກ --</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} {!d.active ? '(ປິດ)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Supervisor Selector */}
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-gray-400 mb-1">
                      👔 ຫົວໜ້າທີມ (Admin):
                    </label>
                    <select
                      value={currentAssign.supervisorId}
                      onChange={(e) => handleAssignmentChange(intern.uid, 'supervisorId', e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                    >
                      <option value="">-- ເລືອກຫົວໜ້າທີມ --</option>
                      {admins.map((a) => (
                        <option key={a.uid} value={a.uid}>
                          {a.fullname} ({a.role})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Column 3: Actions */}
                <div className="flex items-center gap-2 self-end lg:self-center">
                  {isPending && (
                    <>
                      <button
                        disabled={isLoadingThis}
                        onClick={() => handleAction(intern.uid, 'approve')}
                        className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-green-900/30 flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isLoadingThis ? '...' : '✓ ອະນຸມັດ'}
                      </button>
                      <button
                        disabled={isLoadingThis}
                        onClick={() => handleAction(intern.uid, 'reject')}
                        className="px-3 py-2 bg-gray-800 hover:bg-red-950 hover:text-red-400 text-gray-400 rounded-xl text-xs font-bold border border-gray-700 transition-all disabled:opacity-50"
                      >
                        ✕ ປະຕິເສດ
                      </button>
                    </>
                  )}

                  {isApproved && (
                    <>
                      <button
                        disabled={isLoadingThis}
                        onClick={() => handleAction(intern.uid, 'reassign')}
                        className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold border border-gray-700 transition-all disabled:opacity-50"
                        title="ບັນທຶກການຍ້າຍທີມ / ປ່ຽນພະແນກ"
                      >
                        💾 ບັນທຶກທີມ
                      </button>
                      <button
                        disabled={isLoadingThis}
                        onClick={() => handleAction(intern.uid, 'suspend')}
                        className="px-3 py-2 bg-red-950/60 hover:bg-red-900/80 text-red-400 rounded-xl text-xs font-bold border border-red-800/60 transition-all disabled:opacity-50"
                      >
                        🔒 ລະງັບ
                      </button>
                    </>
                  )}

                  {isSuspended && (
                    <button
                      disabled={isLoadingThis}
                      onClick={() => handleAction(intern.uid, 'activate')}
                      className="px-4 py-2 bg-green-950/60 hover:bg-green-900/80 text-green-300 rounded-xl text-xs font-bold border border-green-800/60 transition-all disabled:opacity-50"
                    >
                      🔓 ເປີດໃຊ້ຄືນ
                    </button>
                  )}

                  {isRejected && (
                    <button
                      disabled={isLoadingThis}
                      onClick={() => handleAction(intern.uid, 'approve')}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold border border-gray-700 transition-all disabled:opacity-50"
                    >
                      🔄 ພິຈາລະນາໃໝ່
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Add New Department */}
      {showDeptModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-gray-800 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>🏢</span>
                <span>ເພີ່ມພະແນກຝຶກງານໃໝ່</span>
              </h3>
              <button
                onClick={() => setShowDeptModal(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDepartment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">
                  ຊື່ພະແນກ (Department Name):
                </label>
                <input
                  type="text"
                  required
                  placeholder="ເຊັ່ນ: ພະແນກໄອທີ ແລະ ພັດທະນາລະບົບ (ITD)"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeptModal(false)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold"
                >
                  ຍົກເລີກ
                </button>
                <button
                  type="submit"
                  disabled={creatingDept}
                  className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-md shadow-red-900/30 disabled:opacity-50"
                >
                  {creatingDept ? 'ກຳລັງສ້າງ...' : '✓ ບັນທຶກພະແນກ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
