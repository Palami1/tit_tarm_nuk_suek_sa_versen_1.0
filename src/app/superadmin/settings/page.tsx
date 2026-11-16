'use client';

import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { LeaveType, SystemSettings } from '@/types';
import { DEFAULT_SYSTEM_SETTINGS } from '@/lib/attendance-rules';

export default function SuperAdminSettingsPage() {
  const router = useRouter();
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit / Create Leave Type Form Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [quota, setQuota] = useState<string>('');
  const [requiresDoc, setRequiresDoc] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [order, setOrder] = useState<number>(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let unsubscribeLeaveTypes: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/login');
        return;
      }

      try {
        const uSnap = await getDoc(doc(db, 'users', user.uid));
        if (!uSnap.exists() || uSnap.data()?.role !== 'superadmin') {
          router.replace('/dashboard');
          return;
        }

        const q = collection(db, 'leave_types');
        unsubscribeLeaveTypes = onSnapshot(q, (snap) => {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveType));
          list.sort((a, b) => (a.order || 0) - (b.order || 0));
          setLeaveTypes(list);
          setLoading(false);
        });

      } catch (err) {
        console.error('Settings init error:', err);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeLeaveTypes) unsubscribeLeaveTypes();
    };
  }, [router]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setName('');
    setQuota('');
    setRequiresDoc(false);
    setIsActive(true);
    setOrder(leaveTypes.length + 1);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (lt: LeaveType) => {
    setEditingId(lt.id);
    setName(lt.name);
    setQuota(lt.quotaPerYear !== null ? String(lt.quotaPerYear) : '');
    setRequiresDoc(Boolean(lt.requiresDocument));
    setIsActive(lt.active !== false);
    setOrder(lt.order || 1);
    setIsModalOpen(true);
  };

  const handleSaveLeaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;

    try {
      setSaving(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const res = await fetch('/api/superadmin/leave-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: editingId,
          name,
          quotaPerYear: quota.trim() === '' ? null : Number(quota),
          requiresDocument: requiresDoc,
          active: isActive,
          order,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'ບັນທຶກບໍ່ສຳເລັດ');
      }

      setIsModalOpen(false);
    } catch (err: any) {
      alert('ຂໍ້ຜິດພາດ: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 font-lao pb-16 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-800 pb-6">
        <div>
          <div className="flex items-center space-x-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
            <h1 className="text-3xl font-black text-white uppercase italic tracking-tight">
              ການຕັ້ງຄ່າລະບົບ (System Settings)
            </h1>
          </div>
          <p className="text-[11px] text-gray-400 uppercase tracking-widest mt-1">
            ຈັດການປະເພດການລາພັກ, ໂຄຕ້າ ແລະ ກົດລະບຽບການເຮັດວຽກ
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-red-900/30 flex items-center space-x-1.5"
        >
          <span>+ ເພີ່ມປະເພດການລາພັກ</span>
        </button>
      </div>

      {/* Leave Types Management Table */}
      <div className="bg-[#161b22] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="px-6 py-5 border-b border-gray-800 bg-white/[0.02] flex justify-between items-center">
          <h2 className="text-xs font-black text-white uppercase tracking-wider flex items-center">
            <span className="w-2 h-2 bg-red-600 rounded-full mr-2"></span>
            ປະເພດການລາພັກ (Leave Types & Quotas)
          </h2>
          <span className="text-[10px] text-gray-400 bg-gray-800 px-3 py-1 rounded-full">
            {leaveTypes.length} ປະເພດ
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="text-[10px] text-gray-400 uppercase tracking-wider bg-white/[0.02] border-b border-gray-800">
                <th className="px-6 py-4">ລຳດັບ</th>
                <th className="px-6 py-4">ຊື່ປະເພດການລາ</th>
                <th className="px-6 py-4 text-center">ໂຄຕ້າປະຈຳປີ</th>
                <th className="px-6 py-4 text-center">ເອກະສານແນບ</th>
                <th className="px-6 py-4 text-center">ສະຖານະ</th>
                <th className="px-6 py-4 text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500 font-mono">
                    ກຳລັງໂຫຼດຂໍ້ມູນ...
                  </td>
                </tr>
              ) : leaveTypes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    ຍັງບໍ່ມີປະເພດການລາພັກ
                  </td>
                </tr>
              ) : (
                leaveTypes.map((lt) => (
                  <tr key={lt.id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-4 font-mono text-gray-400">{lt.order || 1}</td>
                    <td className="px-6 py-4 font-bold text-white">
                      {lt.name}
                      <span className="text-[10px] text-gray-500 font-mono ml-2">({lt.id})</span>
                    </td>
                    <td className="px-6 py-4 text-center font-mono font-bold text-gray-200">
                      {lt.quotaPerYear !== null ? `${lt.quotaPerYear} ມື້/ປີ` : 'ບໍ່ຈຳກັດ (null)'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {lt.requiresDocument ? (
                        <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2.5 py-0.5 rounded-full border border-red-500/20">
                          ບັງຄັບແນບ
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-500">ບໍ່ບັງຄັບ</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                        lt.active !== false
                          ? 'bg-green-500/10 text-green-400 border-green-500/20'
                          : 'bg-gray-800 text-gray-400 border-gray-700'
                      }`}>
                        {lt.active !== false ? 'ເປີດໃຊ້ງານ' : 'ປິດໃຊ້ງານ'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleOpenEdit(lt)}
                        className="text-xs font-bold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-600 px-3 py-1.5 rounded-xl border border-red-500/20 transition-all"
                      >
                        ແກ້ໄຂ
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leave Type Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-gray-800 rounded-3xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                {editingId ? 'ແກ້ໄຂປະເພດການລາ' : 'ເພີ່ມປະເພດການລາພັກໃໝ່'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveLeaveType} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-gray-300 font-bold block">ຊື່ປະເພດການລາພັກ *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="ເຊັ່ນ: ລາພັກປະຈຳປີ"
                  className="w-full bg-[#0b0e14] border border-gray-700 text-white px-3 py-2.5 rounded-xl outline-none focus:border-red-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-gray-300 font-bold block">ໂຄຕ້າປະຈຳປີ (ມື້) - ປະວ່າງຖ້າບໍ່ຈຳກັດ</label>
                <input
                  type="number"
                  min={1}
                  value={quota}
                  onChange={(e) => setQuota(e.target.value)}
                  placeholder="ເຊັ່ນ: 15 (ຫຼື ປະວ່າງ = ບໍ່ຈຳກັດ)"
                  className="w-full bg-[#0b0e14] border border-gray-700 text-white px-3 py-2.5 rounded-xl outline-none focus:border-red-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-gray-300 font-bold block">ລຳດັບສະແດງ (Order)</label>
                <input
                  type="number"
                  min={1}
                  value={order}
                  onChange={(e) => setOrder(Number(e.target.value))}
                  className="w-full bg-[#0b0e14] border border-gray-700 text-white px-3 py-2.5 rounded-xl outline-none focus:border-red-500"
                />
              </div>

              <div className="flex items-center space-x-3 pt-1">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requiresDoc}
                    onChange={(e) => setRequiresDoc(e.target.checked)}
                    className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                  />
                  <span className="text-gray-200 font-bold">ບັງຄັບແນບເອກະສານຢັ້ງຢືນ (Requires Document)</span>
                </label>
              </div>

              <div className="flex items-center space-x-3">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                  />
                  <span className="text-gray-200 font-bold">ເປີດໃຊ້ງານ (Active)</span>
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-gray-400 hover:text-white"
                >
                  ຍົກເລີກ
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2 rounded-xl disabled:opacity-50"
                >
                  {saving ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
