'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Intern {
  id: string;
  fullname: string;
  email: string;
  role: string;
  college?: string;
  major?: string;
  status?: string;
}

const InternsListPage = () => {
  const [interns, setInterns] = useState<Intern[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();

  useEffect(() => {
    // ດຶງລາຍຊື່ນັກສຶກສາທັງໝົດ (role: intern)
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'intern')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Intern[];
      setInterns(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredInterns = interns.filter(i => 
    i.fullname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-white uppercase italic tracking-tight">Interns Management</h1>
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] mt-1">LTC Intern Tracking System</p>
        </div>
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-gray-500 group-focus-within:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="2" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="ຄົ້ນຫາລາຍຊື່..."
            className="bg-[#161b22] border border-gray-800 text-sm text-gray-200 pl-11 pr-6 py-3 rounded-2xl w-full md:w-80 focus:ring-1 focus:ring-red-600 focus:border-red-600 outline-none transition-all card-shadow"
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Interns Table */}
      <div className="bg-[#161b22] border border-gray-800 rounded-[2.5rem] overflow-hidden card-shadow">
        <div className="px-8 py-6 border-b border-gray-800 flex justify-between items-center bg-white/5">
          <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest text-center">ລາຍຊື່ນັກສຶກສາທັງໝົດ</h2>
          <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20 uppercase tracking-tighter">
            {filteredInterns.length} Participants
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] text-gray-500 uppercase tracking-[0.2em] bg-white/5 border-b border-gray-800">
                <th className="px-8 py-5">Intern Detail</th>
                <th className="px-8 py-5">Academic Info</th>
                <th className="px-8 py-5">Status</th>
                <th className="px-8 py-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center text-gray-500 font-mono text-xs">ເປີດໃຊ້ງານລະບົບຄົ້ນຫາ...</td>
                </tr>
              ) : filteredInterns.length > 0 ? (
                filteredInterns.map((intern) => (
                  <tr key={intern.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600/10 to-red-600/5 flex items-center justify-center font-black text-red-500 border border-red-500/10 group-hover:scale-110 transition-transform">
                          {intern.fullname?.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-200 group-hover:text-white transition-colors">{intern.fullname}</div>
                          <div className="text-[10px] text-gray-500 font-mono mt-1">{intern.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-xs font-bold text-gray-400">{intern.college || '—'}</div>
                      <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-tighter">{intern.major || '—'}</div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md border ${
                        (intern.status || 'Active') === 'Active' 
                          ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                          : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                      }`}>
                        {intern.status || 'Active'}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <Link 
                        href={`/admin/interns/profile?id=${intern.id}`}
                        className="inline-flex items-center space-x-2 text-[10px] font-black text-red-500 hover:text-white bg-red-500/5 hover:bg-red-600 px-4 py-2 rounded-xl border border-red-500/10 transition-all uppercase tracking-tighter shadow-sm"
                      >
                        <span>View Profile</span>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M9 5l7 7-7 7" strokeWidth="2.5" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center text-gray-600 italic text-sm">ບໍ່ພົບລາຍຊື່ທີ່ທ່ານຄົ້ນຫາ</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InternsListPage;