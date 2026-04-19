'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, where, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';

const AllReportsPage = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [interns, setInterns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedIntern, setSelectedIntern] = useState('all');
  const router = useRouter();

  const handleDateMask = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<string>>) => {
    let val = e.target.value.replace(/\D/g, ''); // Remove non-digits
    if (val.length >= 2) val = val.substring(0, 2) + '/' + val.substring(2);
    if (val.length >= 5) val = val.substring(0, 5) + '/' + val.substring(5, 9);
    setter(val);
  };

  const formatLaoDate = (isoString?: string) => {
    if (!isoString || isoString.length < 10) return 'ບໍ່ໄດ້ກຳໜົດ';
    const parts = isoString.split('/');
    if (parts.length !== 3) return isoString;
    const months = ['ມັງກອນ', 'ກຸມພາ', 'ມີນາ', 'ເມສາ', 'ພຶດສະພາ', 'ມິຖຸນາ', 'ກໍລະກົດ', 'ສິງຫາ', 'ກັນຍາ', 'ຕຸລາ', 'ພະຈິກ', 'ທັນວາ'];
    return `ວັນທີ ${parseInt(parts[0], 10)} ${months[parseInt(parts[1], 10) - 1]} ${parts[2]}`;
  };

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
      const docs = snapshot.docs.map(doc => {
        const data = doc.data();
        // Normalize date to a yyyy-mm-dd string regardless of Firestore storage type
        let dateStr = '';
        if (data.date) {
          if (typeof data.date === 'string') {
            dateStr = data.date.substring(0, 10); // handles both "2026-04-09" and ISO strings
          } else if (typeof data.date.toDate === 'function') {
            dateStr = data.date.toDate().toISOString().substring(0, 10);
          }
        } else if (data.timestamp?.toDate) {
          dateStr = data.timestamp.toDate().toISOString().substring(0, 10);
        }
        return {
          id: doc.id,
          ...data,
          dateNorm: dateStr, // always yyyy-mm-dd
          timeStr: data.timestamp?.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) || 'Pending'
        };
      });
      setReports(docs);
      setLoading(false);
    });

    // Fetch interns list for filtering — store Firestore doc ID as uid
    const fetchInterns = async () => {
      const qI = query(collection(db, 'users'), where('role', '==', 'intern'));
      const snap = await getDocs(qI);
      setInterns(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    };
    fetchInterns();

    return () => {
      unsubscribe();
      unsubscribeAuth();
    };
  }, [router]);

  const filteredReports = React.useMemo(() => {
    return reports.filter(r => {
      // Create timestamps for robust numerical comparison (ignores format/string bugs)
      let rTime = 0;
      if (r.dateNorm) {
        // Parse "YYYY-MM-DD" as local time noon to avoid timezone boundary issues
        const [y, m, d] = r.dateNorm.split('-');
        if (y && m && d) rTime = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0).getTime();
      }

      let sTime = 0;
      if (startDate && startDate.length === 10) {
        const [d, m, y] = startDate.split('/');
        if (y && m && d) sTime = new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0).getTime();
      }

      let eTime = Infinity;
      if (endDate && endDate.length === 10) {
        const [d, m, y] = endDate.split('/');
        if (y && m && d) eTime = new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59).getTime();
      }

      // If startDate is partial (e.g. they haven't typed the year), ignore `sTime`
      const isValidStart = startDate.length === 10;
      const isValidEnd = endDate.length === 10;

      const dateMatch = (!isValidStart || rTime >= sTime) && (!isValidEnd || rTime <= eTime);

      // Match on userId OR internId
      const internMatch =
        selectedIntern === 'all' ||
        r.userId === selectedIntern ||
        r.internId === selectedIntern;
        
      return dateMatch && internMatch;
    });
  }, [reports, startDate, endDate, selectedIntern]);

  const hasFilter = startDate || endDate || selectedIntern !== 'all';

  const exportReportsToExcel = () => {
    if (filteredReports.length === 0) {
      alert('ບໍ່ມີລາຍງານທີ່ຈະອອກ Excel');
      return;
    }

    const reportData = filteredReports.map(r => {
      const dStr = typeof r.dateNorm === 'string' ? r.dateNorm : '';
      const dateFormattedForExcel = dStr ? dStr.split('-').reverse().join('/') : '';
      return {
        'ວັນທີ': dateFormattedForExcel,
        'ເວລາ': r.timeStr,
        'ຊື່ນັກສຶກສາ': r.userName,
        'ID ນັກສຶກສາ': r.userId?.substring(0, 8),
        'ເນື້ອໃນລາຍງານ': r.content
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(reportData);
    const wscols = [
      { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 50 }
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Daily_Reports");
    const fileName = `LTC_Daily_Reports_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

        // formatLaoDate moved inside component scope earlier

  return (
    <div className="bg-[#0b0e14] pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10 animate-slide-up stagger-1">
        <div>
          <h1 className="text-3xl font-black text-white uppercase italic tracking-tight">System Reports</h1>
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] mt-1">Attendance & Activity Logs</p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={exportReportsToExcel}
            className="hover-bounce bg-[#161b22] border border-gray-800 text-green-500 px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-gray-800 hover:text-green-400 hover:border-green-500/50 shadow-lg hover:shadow-green-900/20 transition-all flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Export Excel</span>
          </button>
          <button className="btn-ripple hover-bounce bg-red-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-red-500 shadow-lg shadow-red-900/50 transition-all flex items-center">
            Print PDF
          </button>
        </div>
      </div>

      <div className="bg-[#161b22] border border-gray-800 rounded-3xl p-8 mb-8 flex flex-wrap gap-8 items-end shadow-2xl animate-slide-up stagger-2 card-hover">
        <div className="space-y-3">
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">ຊ່ວງວັນທີ (Date Range)</label>
          <div className="flex items-center space-x-3">
            <input 
              type="text" 
              placeholder="ວວ/ດດ/ປປປປ"
              maxLength={10}
              value={startDate}
              onChange={(e) => handleDateMask(e, setStartDate)}
              className="bg-[#0d1117] border border-gray-800 rounded-xl text-[10px] font-bold text-gray-400 focus:ring-red-600 outline-none p-3 transition-all text-center placeholder-gray-700 w-28" 
            />
            <span className="text-gray-700 text-xs font-bold uppercase">To</span>
            <input 
              type="text" 
              placeholder="ວວ/ດດ/ປປປປ"
              maxLength={10}
              value={endDate}
              onChange={(e) => handleDateMask(e, setEndDate)}
              className="bg-[#0d1117] border border-gray-800 rounded-xl text-[10px] font-bold text-gray-400 focus:ring-red-600 outline-none p-3 transition-all text-center placeholder-gray-700 w-28" 
            />
          </div>
        </div>
        
        <div className="space-y-3">
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">ນັກສຶກສາ (Intern)</label>
          <select 
            value={selectedIntern}
            onChange={(e) => setSelectedIntern(e.target.value)}
            className="bg-[#0d1117] border border-gray-800 rounded-xl text-[10px] font-bold text-gray-400 focus:ring-red-600 w-64 outline-none p-3 appearance-none transition-all cursor-pointer"
          >
            <option value="all">ທັງໝົດທຸກຄົນ (All Interns)</option>
            {interns.map(i => (
              <option key={i.uid} value={i.uid}>{(i as any).fullname}</option>
            ))}
          </select>
        </div>

        <button 
          onClick={() => { setStartDate(''); setEndDate(''); setSelectedIntern('all'); }}
          className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
            hasFilter
              ? 'bg-red-600 text-white border-red-600 hover:bg-red-700 shadow-lg shadow-red-900/30'
              : 'bg-gray-800 text-gray-500 border-gray-700 hover:bg-gray-700'
          }`}
        >
          {hasFilter ? '✕ Reset Filters' : 'Reset Filters'}
        </button>

        {/* Live result count and Debug Info */}
        {hasFilter && (
          <div className="ml-auto text-right mb-4 w-full md:w-auto">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
              <span className="text-red-500">{filteredReports.length}</span> / {reports.length} ລາຍງານ
            </div>
            {(startDate || endDate) && (
              <div className="bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-xl inline-block text-left">
                <div className="text-[10px] font-black text-red-400 mb-1">ລະບົບກຳລັງກອງວັນທີ:</div>
                <div className="text-xs font-bold text-gray-300">
                  ເລີ່ມ: <span className="text-white">{formatLaoDate(startDate)}</span>
                </div>
                <div className="text-xs font-bold text-gray-300">
                  ເຖິງ: <span className="text-white">{formatLaoDate(endDate)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-6 animate-slide-up stagger-3">
        {loading ? (
          <p className="text-center text-gray-500 py-20 font-mono text-xs uppercase tracking-widest">ສ້າງລາຍການລາຍງານ...</p>
        ) : filteredReports.length > 0 ? (
          filteredReports.map((report) => (
            <div key={report.id} className="bg-[#161b22] border border-gray-800 rounded-3xl p-8 group hover:border-red-500/50 transition-all shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center font-black text-white shadow-lg shadow-red-900/30 group-hover:scale-110 transition-transform">
                    {report.userName?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-gray-100 uppercase tracking-tight">
                      {report.userName} 
                      <span className="text-gray-600 font-bold ml-2 text-[10px]"># {report.userId?.substring(0, 8)}</span>
                    </h3>
                    <div className="flex items-center space-x-4 mt-1.5">
                      <div className="flex items-center space-x-1.5">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                        <span className="text-[10px] text-green-500 font-black tracking-widest">{report.date}</span>
                      </div>
                      <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">{report.timeStr}</span>
                    </div>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-gray-600 bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-800 uppercase tracking-tighter">Report ID: #{report.id?.substring(0, 8)}</span>
              </div>
              <div className="mt-6 p-6 bg-[#0d1117] rounded-2xl border border-gray-800/50 group-hover:border-red-500/20 transition-all">
                <p className="text-[9px] font-black text-red-500 uppercase tracking-[0.2em] mb-3">Work Summary:</p>
                <p className="text-[13px] text-gray-400 leading-relaxed font-lao">{report.content}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-[#161b22] border border-gray-800 rounded-3xl p-20 text-center shadow-2xl">
            <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-6 border border-gray-800">
               <svg className="w-8 h-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
               </svg>
            </div>
            <p className="text-[10px] text-gray-600 font-black uppercase tracking-[0.3em]">ຍັງບໍ່ມີລາຍງານໃນຊ່ວງເວລານີ້</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AllReportsPage;
