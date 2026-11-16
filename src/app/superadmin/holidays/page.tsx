'use client';

import React, { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { Holiday } from '@/types';

export default function SuperAdminHolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingDate, setDeletingDate] = useState<string | null>(null);

  // Form State
  const [date, setDate] = useState('');
  const [name, setName] = useState('');

  const fetchHolidays = async () => {
    try {
      setLoading(true);
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const token = await currentUser.getIdToken();

      const res = await fetch('/api/superadmin/holidays', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setHolidays(data.holidays || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, []);

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !name.trim() || saving) return;

    try {
      setSaving(true);
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const token = await currentUser.getIdToken();

      const res = await fetch('/api/superadmin/holidays', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ date, name }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'ບັນທຶກບໍ່ສຳເລັດ');
      }

      alert(resJson.message || 'ບັນທຶກວັນພັກສຳເລັດ!');
      setDate('');
      setName('');
      await fetchHolidays();
    } catch (err: any) {
      alert('ຂໍ້ຜິດພາດ: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHoliday = async (hDate: string, hName: string) => {
    if (!confirm(`ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບວັນພັກ: "${hName}" (${hDate})?`)) return;

    try {
      setDeletingDate(hDate);
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const token = await currentUser.getIdToken();

      const res = await fetch(`/api/superadmin/holidays?date=${hDate}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'ລຶບບໍ່ສຳເລັດ');
      }

      alert('ລຶບວັນພັກສຳເລັດ!');
      await fetchHolidays();
    } catch (err: any) {
      alert('ຂໍ້ຜິດພາດ: ' + err.message);
    } finally {
      setDeletingDate(null);
    }
  };

  return (
    <div className="space-y-8 font-lao">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-6">
        <div>
          <span className="px-3 py-1 bg-red-950/60 text-red-400 border border-red-800/60 rounded-full text-xs font-bold uppercase tracking-wider">
            Super Admin Control
          </span>
          <h1 className="text-3xl font-black text-white mt-2 tracking-tight">
            ປະຕິທິນວັນພັກລັດຖະການ & ບໍລິສັດ (Holidays)
          </h1>
          <p className="text-gray-400 text-xs mt-1">
            ວັນພັກທີ່ກຳນົດຢູ່ນີ້ຈະຖືກຕັດອອກຈາກມື້ເຮັດວຽກທີ່ຕ້ອງມາ ເພື່ອໃຫ້ການຕັດເກຣດຖືກຕ້ອງຕາມຄວາມເປັນຈິງ
          </p>
        </div>

        <button
          onClick={fetchHolidays}
          className="p-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs border border-gray-700 transition-all self-start"
          title="Refresh"
        >
          🔄 ໂຫຼດໃໝ່
        </button>
      </div>

      {/* Add Holiday Form Card */}
      <section className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>➕</span>
          <span>ເພີ່ມວັນພັກໃໝ່</span>
        </h3>

        <form onSubmit={handleAddHoliday} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">
              ວັນທີ (Date):
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">
              ຊື່ວັນພັກ (Holiday Name):
            </label>
            <input
              type="text"
              required
              placeholder="ເຊັ່ນ: ວັນຊາດທີ 2 ທັນວາ, ບຸນປີໃໝ່ລາວ"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs shadow-md shadow-red-900/30 transition-all disabled:opacity-50"
            >
              {saving ? 'ກຳລັງບັນທຶກ...' : '✓ ບັນທຶກວັນພັກ'}
            </button>
          </div>
        </form>
      </section>

      {/* Holidays List Table */}
      <section className="bg-[#161b22] border border-gray-800 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-gray-800 flex justify-between items-center">
          <h3 className="font-bold text-white text-sm">ລາຍການວັນພັກທັງໝົດ</h3>
          <span className="text-xs text-gray-400 font-bold">{holidays.length} ວັນ</span>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-500 text-xs">ກຳລັງໂຫຼດ...</p>
          </div>
        ) : holidays.length === 0 ? (
          <div className="py-16 text-center text-gray-500 text-xs">
            ຍັງບໍ່ມີວັນພັກໃນລະບົບ (ກະລຸນາເພີ່ມວັນພັກດ້ານເທິງ)
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-[11px] font-bold text-gray-400 uppercase bg-gray-900/50">
                  <th className="py-3 px-6">ວັນທີ (Date)</th>
                  <th className="py-3 px-6">ຊື່ວັນພັກ</th>
                  <th className="py-3 px-6 text-right">ຈັດການ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/80 text-xs">
                {holidays.map((h) => (
                  <tr key={h.date} className="hover:bg-gray-800/30 transition-colors">
                    <td className="py-4 px-6 font-bold text-white font-mono">{h.date}</td>
                    <td className="py-4 px-6 text-gray-200 font-medium">{h.name}</td>
                    <td className="py-4 px-6 text-right">
                      <button
                        disabled={deletingDate === h.date}
                        onClick={() => handleDeleteHoliday(h.date, h.name)}
                        className="px-3 py-1.5 bg-red-950/60 hover:bg-red-900/80 text-red-400 border border-red-800/60 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                      >
                        {deletingDate === h.date ? '...' : 'ລຶບ'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
