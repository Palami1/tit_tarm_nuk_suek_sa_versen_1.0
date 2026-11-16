'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserProfile, Department } from '@/types';

export default function InternsListPage() {
  const [interns, setInterns] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [userRole, setUserRole] = useState<'admin' | 'superadmin' | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | undefined;

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

        // Fetch departments
        const deptsSnap = await getDocs(collection(db, 'departments'));
        const deptList = deptsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department));
        setDepartments(deptList.filter(d => d.active !== false));

        // Query interns scoped to supervisor if admin
        let q;
        if (role === 'superadmin') {
          q = query(
            collection(db, 'users'),
            where('role', '==', 'intern')
          );
        } else {
          q = query(
            collection(db, 'users'),
            where('role', '==', 'intern'),
            where('supervisorId', '==', user.uid)
          );
        }

        unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
          const data = snapshot.docs.map(doc => ({
            uid: doc.id,
            ...doc.data()
          })) as UserProfile[];
          setInterns(data);
          setLoading(false);
        }, (err) => {
          console.error('Interns fetch error:', err);
          setLoading(false);
        });

      } catch (err) {
        console.error('Interns page init error:', err);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, [router]);

  const deptMap = useMemo(() => {
    const map: Record<string, string> = {};
    departments.forEach(d => {
      map[d.id] = d.name;
    });
    return map;
  }, [departments]);

  // Filtered interns by department and search
  const filteredInterns = useMemo(() => {
    return interns.filter(intern => {
      const matchDept = selectedDeptId === 'all' || intern.departmentId === selectedDeptId;
      const term = searchTerm.toLowerCase();
      const matchSearch =
        !searchTerm.trim() ||
        intern.fullname?.toLowerCase().includes(term) ||
        intern.email?.toLowerCase().includes(term) ||
        intern.phone?.toLowerCase().includes(term) ||
        intern.college?.toLowerCase().includes(term);

      return matchDept && matchSearch;
    });
  }, [interns, selectedDeptId, searchTerm]);

  return (
    <div className="space-y-8 font-lao pb-10">
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center space-x-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
            <h1 className="text-3xl font-black text-white uppercase italic tracking-tight">
              {userRole === 'superadmin' ? 'ລາຍຊື່ນັກສຶກສາທັງໝົດ' : 'ນັກສຶກສາໃນທີມຂອງທ່ານ'}
            </h1>
          </div>
          <p className="text-[11px] text-gray-400 uppercase tracking-widest mt-1">
            {userRole === 'superadmin'
              ? 'ຈັດການ ແລະ ຕິດຕາມນັກສຶກສາທຸກພະແນກ'
              : `ນັກສຶກສາທີ່ຢູ່ພາຍໃຕ້ການຊີ້ນຳຂອງທ່ານ (${filteredInterns.length} ຄົນ)`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {userRole === 'superadmin' && (
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="bg-[#161b22] border border-gray-800 text-xs text-white px-4 py-3 rounded-2xl focus:ring-1 focus:ring-red-600 outline-none"
            >
              <option value="all">ທຸກພະແນກ</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}

          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-gray-500 group-focus-within:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="2" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="ຄົ້ນຫາຊື່, ອີເມວ, ວິທະຍາໄລ..."
              className="bg-[#161b22] border border-gray-800 text-xs text-gray-200 pl-11 pr-6 py-3 rounded-2xl w-full sm:w-72 focus:ring-1 focus:ring-red-600 outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Interns Table */}
      <div className="bg-[#161b22] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="px-8 py-5 border-b border-gray-800 flex justify-between items-center bg-white/[0.02]">
          <h2 className="text-xs font-black text-gray-300 uppercase tracking-widest">
            {userRole === 'superadmin' ? 'ລາຍຊື່ນັກສຶກສາ (Super Admin View)' : 'ນັກສຶກສາໃນທີມ (My Team)'}
          </h2>
          <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20 uppercase">
            {filteredInterns.length} ຄົນ
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] text-gray-400 uppercase tracking-wider bg-white/[0.02] border-b border-gray-800">
                <th className="px-6 py-4">ນັກສຶກສາ</th>
                <th className="px-6 py-4">ພະແນກ</th>
                <th className="px-6 py-4">ການສຶກສາ</th>
                <th className="px-6 py-4">ໄລຍະຝຶກງານ</th>
                <th className="px-6 py-4 text-center">ເກຣດ</th>
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
              ) : filteredInterns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-gray-400">
                    ບໍ່ພົບຂໍ້ມູນນັກສຶກສາ
                  </td>
                </tr>
              ) : (
                filteredInterns.map((intern) => {
                  const deptName = (intern.departmentId && deptMap[intern.departmentId]) || 'ບໍ່ໄດ້ລະບຸ';
                  return (
                    <tr key={intern.uid} className="hover:bg-white/[0.02] transition-colors group">
                      {/* Name & Contact */}
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-600/20 to-red-600/5 flex items-center justify-center font-black text-red-500 border border-red-500/20">
                            {intern.fullname?.charAt(0) || 'U'}
                          </div>
                          <div>
                            <div className="font-bold text-white group-hover:text-red-400 transition-colors">
                              {intern.fullname || '—'}
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                              {intern.email}
                            </div>
                            {intern.phone && (
                              <div className="text-[10px] text-gray-400 font-mono">
                                📞 {intern.phone}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td className="px-6 py-4">
                        <span className="text-[11px] text-gray-300 font-medium bg-gray-800/60 px-2.5 py-1 rounded-lg border border-gray-700/50">
                          {deptName}
                        </span>
                      </td>

                      {/* College & Major */}
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-200">{intern.college || '—'}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{intern.major || '—'}</div>
                      </td>

                      {/* Internship Dates */}
                      <td className="px-6 py-4 font-mono text-[11px] text-gray-300">
                        {intern.startDate && intern.endDate ? (
                          <div>
                            <div>{intern.startDate}</div>
                            <div className="text-gray-400 text-[10px]">ຫາ {intern.endDate}</div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Final Grade Status */}
                      <td className="px-6 py-4 text-center">
                        {intern.finalGrade?.grade ? (
                          <div>
                            <span className="inline-block px-2 py-0.5 rounded font-black text-sm bg-red-500/10 text-red-400 border border-red-500/30">
                              {intern.finalGrade.grade}
                            </span>
                            <div className="text-[9px] text-gray-400 mt-0.5">
                              {intern.finalGrade.status === 'pending_approval' ? 'ລໍຖ້າອະນຸມັດ' : 'ອະນຸມັດແລ້ວ'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-[10px]">ຍັງບໍ່ສະເໜີ</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 text-center">
                        <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
                          intern.status === 'approved'
                            ? 'bg-green-500/10 text-green-400 border-green-500/20'
                            : intern.status === 'pending'
                            ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}>
                          {intern.status || 'Active'}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-6 py-4 text-right">
                        <Link 
                          href={`/admin/interns/${intern.uid}`}
                          className="inline-flex items-center space-x-1.5 text-xs font-bold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-600 px-3.5 py-1.5 rounded-xl border border-red-500/20 transition-all shadow-sm"
                        >
                          <span>ກວດສອບ & ປະເມີນ</span>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
