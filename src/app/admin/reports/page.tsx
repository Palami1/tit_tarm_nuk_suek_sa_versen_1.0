'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';

const AllReportsPage = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/login');
      }
    });

    const q = query(
      collection(db, 'daily_reports'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timeStr: doc.data().timestamp?.toDate().toLocaleTimeString('en-US', { hour12: true }) || 'Pending'
      }));
      setReports(docs);
      setLoading(false);
    });

    return () => {
      unsubscribe();
      unsubscribeAuth();
    };
  }, []);

  const exportReportsToExcel = () => {
    if (reports.length === 0) {
      alert('ບໍ່ມີລາຍງານທີ່ຈະອອກ Excel');
      return;
    }

    const reportData = reports.map(r => ({
      'ວັນທີ': r.date,
      'ເວລາ': r.timeStr,
      'ຊື່ນັກສຶກສາ': r.userName,
      'ID ນັກສຶກສາ': r.userId?.substring(0, 8),
      'ເນື້ອໃນລາຍງານ': r.content
    }));

    const worksheet = XLSX.utils.json_to_sheet(reportData);

    // ✅ Add Column Widths for better readability
    const wscols = [
      { wch: 15 }, // ວັນທີ
      { wch: 15 }, // ເວລາ
      { wch: 25 }, // ຊື່ນັກສຶກສາ
      { wch: 15 }, // ID ນັກສຶກສາ
      { wch: 50 }  // ເນື້ອໃນລາຍງານ (ໃຫ້ກວ້າງກວ່າໝູ່)
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Daily_Reports");
    const fileName = `LTC_Daily_Reports_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="bg-[#0b0e14]">
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-3xl font-black text-white uppercase italic tracking-tight">System Reports</h1>
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] mt-1">Attendance & Activity Logs</p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={exportReportsToExcel}
            className="bg-[#161b22] border border-gray-800 text-green-500 px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-gray-800 transition-all flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Export Excel</span>
          </button>
          <button className="bg-red-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-red-700 shadow-lg shadow-red-900/20 transition-all flex items-center">
            Print PDF
          </button>
        </div>
      </div>

      <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-5 mb-8 flex flex-wrap gap-6 items-end">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-gray-500 uppercase">ເລືອກຊ່ວງວັນທີ</label>
          <div className="flex items-center space-x-2">
            <input type="date" className="bg-[#0d1117] border-gray-800 rounded-lg text-xs text-gray-400 focus:ring-red-600 outline-none p-2" />
            <span className="text-gray-600">to</span>
            <input type="date" className="bg-[#0d1117] border-gray-800 rounded-lg text-xs text-gray-400 focus:ring-red-600 outline-none p-2" />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-gray-500 uppercase">ນັກສຶກສາ</label>
          <select className="bg-[#0d1117] border-gray-800 rounded-lg text-xs text-gray-400 focus:ring-red-600 w-48 outline-none p-2">
            <option>ທັງໝົດທຸກຄົນ</option>
          </select>
        </div>
        <button className="bg-red-600/10 text-red-500 border border-red-500/20 px-6 py-2 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition-all">
          Apply Filter
        </button>
      </div>

      <div className="space-y-4">
        {loading ? (
          <p className="text-center text-gray-500 py-10">ກຳລັງໂຫຼດລາຍງານ...</p>
        ) : reports.length > 0 ? (
          reports.map((report) => (
            <div key={report.id} className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 group hover:border-red-500/50 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center font-bold text-white shadow-lg shadow-red-900/40">
                    {report.userName?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-200">
                      {report.userName} <span className="text-gray-600 font-normal ml-2">@ {report.userId?.substring(0, 8)}</span>
                    </h3>
                    <div className="flex items-center space-x-3 mt-1">
                      <span className="text-[10px] text-green-500 font-bold">{report.date}</span>
                      <span className="text-[10px] text-gray-500 font-bold">{report.timeStr}</span>
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-gray-500 bg-gray-800 px-2 py-1 rounded">ID: #{report.id?.substring(0, 5)}</span>
              </div>
              <div className="mt-4 p-4 bg-[#0d1117] rounded-xl border border-gray-800">
                <p className="text-[11px] font-bold text-red-500 uppercase mb-1">Daily Report:</p>
                <p className="text-xs text-gray-400 leading-relaxed">{report.content}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-400 py-10">ຍັງບໍ່ມີລາຍງານໃດໆ</p>
        )}
      </div>
    </div>
  );
};

export default AllReportsPage;
