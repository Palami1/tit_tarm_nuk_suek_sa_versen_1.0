'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

const InternDetailPage = () => {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') as string;
  const router = useRouter();

  const [intern, setIntern] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [skills, setSkills] = useState<{ name: string; percent: number }[]>([]);
  const [skillsSaving, setSkillsSaving] = useState(false);
  const [skillsSaved, setSkillsSaved] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) router.push('/login');
    });

    const fetchData = async () => {
      try {
        if (!id) return;
        
        // Fetch User Info
        const userSnap = await getDoc(doc(db, 'users', id));
        if (userSnap.exists()) {
          const data = userSnap.data();
          setIntern(data);
          // Load existing skills or default to empty
          setSkills(Array.isArray(data.skills) ? data.skills : []);
        }

        // Fetch Attendance
        const qAttendance = query(
          collection(db, 'attendance'),
          where('userId', '==', id),
          orderBy('timestamp', 'desc')
        );
        const attendSnap = await getDocs(qAttendance);
        const attendDocs = attendSnap.docs.map(doc => {
          const data = doc.data() as any;
          let timeStr = '--:--';
          if (data.timestamp?.toDate) {
            timeStr = data.timestamp.toDate().toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit', 
              hour12: true 
            });
          }
          return { id: doc.id, ...data, timeStr };
        });
        setAttendance(attendDocs);

        // Fetch Reports
        const qReports = query(
          collection(db, 'daily_reports'),
          where('userId', '==', id),
          orderBy('timestamp', 'desc')
        );
        const reportSnap = await getDocs(qReports);
        setReports(reportSnap.docs.map(d => ({ 
          id: d.id, 
          ...d.data(),
          timeStr: d.data().timestamp?.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) || 'Pending'
        })));

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchData();
    return () => unsubscribeAuth();
  }, [id, router]);

  // Format time helper
  const fmtTime = (t: any): string => {
    if (!t) return '--:--';
    try {
      const d = typeof t === 'string' ? new Date(t) : t.toDate ? t.toDate() : new Date(t);
      if (isNaN(d.getTime())) return '--:--';
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch { return '--:--'; }
  };

  // Check if time value is after 08:00
  const isAfter8 = (t: any): boolean => {
    if (!t) return false;
    try {
      const d = typeof t === 'string' ? new Date(t) : t.toDate ? t.toDate() : new Date(t);
      return d.getHours() > 8 || (d.getHours() === 8 && d.getMinutes() > 0);
    } catch { return false; }
  };

  // Check if checkout is before 17:00 (early leave)
  const isBefore5PM = (t: any): boolean => {
    if (!t) return false;
    try {
      const d = typeof t === 'string' ? new Date(t) : t.toDate ? t.toDate() : new Date(t);
      return d.getHours() < 17;
    } catch { return false; }
  };

  // Group attendance by date — each doc has checkInTime + checkOutTime on the same record
  const groupedAttendance = React.useMemo(() => {
    const groups: Record<string, any[]> = {};

    attendance.forEach(rec => {
      const key = rec.date || 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(rec);
    });

    return Object.entries(groups)
      .map(([date, recs]) => {
        const sorted = [...recs].sort((a: any, b: any) => {
          const ta = a.checkInTime ? new Date(a.checkInTime).getTime() : (a.timestamp?.seconds || 0) * 1000;
          const tb = b.checkInTime ? new Date(b.checkInTime).getTime() : (b.timestamp?.seconds || 0) * 1000;
          return ta - tb;
        });

        const s1 = sorted[0];
        const s2 = sorted[1];
        const isLate = recs.some((r: any) => r.status === 'Late');

        return {
          date,
          checkIn1: fmtTime(s1?.checkInTime),
          checkOut1: fmtTime(s1?.checkOutTime),
          checkIn2: fmtTime(s2?.checkInTime),
          checkOut2: fmtTime(s2?.checkOutTime),
          checkIn1Late: isAfter8(s1?.checkInTime),
          checkIn2Late: isAfter8(s2?.checkInTime),
          checkOut1Early: s1?.checkOutTime ? isBefore5PM(s1.checkOutTime) : false,
          checkOut2Early: s2?.checkOutTime ? isBefore5PM(s2.checkOutTime) : false,
          status: isLate ? 'Late' : 'On-time',
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendance]);

  if (loading || !id) return (
    <div className="flex items-center justify-center h-screen bg-[#0b0e14]">
      <div className="text-gray-500 font-mono text-xs uppercase tracking-widest animate-pulse">Initializing System...</div>
    </div>
  );

  if (!intern) return (
    <div className="flex items-center justify-center h-screen bg-[#0b0e14]">
      <div className="text-red-500 font-black uppercase italic tracking-tighter">Intern Not Found</div>
    </div>
  );

  return (
    <div className="space-y-10 pb-20">
      {/* Header & Profile */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <button 
          onClick={() => router.back()} 
          className="bg-gray-800/50 border border-gray-800 text-gray-400 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:text-white hover:bg-gray-800 transition-all flex items-center space-x-2"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span>Back to List</span>
        </button>
        <div className="text-right">
          <p className="text-[9px] text-gray-600 font-black uppercase tracking-[0.4em]">System ID: {id.substring(0, 8)}</p>
        </div>
      </div>

      <section className="bg-[#161b22] border border-gray-800 rounded-[3rem] p-10 flex flex-col md:flex-row items-center md:items-start gap-10 shadow-2xl relative overflow-hidden group animate-slide-up stagger-1 card-hover">
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
          <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        </div>
        
        <div className="w-32 h-32 rounded-[2rem] bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center font-black text-white text-5xl border border-red-500/20 shadow-[0_0_30px_rgba(225,29,72,0.2)]">
          {intern.fullname?.charAt(0)}
        </div>
        
        <div className="flex-1 text-center md:text-left z-10">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter">{intern.fullname}</h1>
            <span className="px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-lg text-[9px] font-black text-green-500 uppercase tracking-widest h-fit opacity-90 hover:opacity-100 transition-all cursor-default hover-wiggle">Active Status</span>
          </div>
          <p className="text-gray-500 mt-2 font-mono text-xs font-bold uppercase tracking-widest">{intern.email} • {intern.phone}</p>
          
          <div className="mt-8 flex flex-wrap gap-4 justify-center md:justify-start">
            <div className="bg-[#0d1117] border border-gray-800 rounded-2xl p-4 min-w-[140px] hover:border-gray-700 transition-all">
              <p className="text-[8px] text-gray-600 font-black uppercase tracking-widest mb-1">Institution</p>
              <p className="text-[11px] font-bold text-gray-300 uppercase">{intern.college || '—'}</p>
            </div>
            <div className="bg-[#0d1117] border border-gray-800 rounded-2xl p-4 min-w-[140px] hover:border-gray-700 transition-all">
              <p className="text-[8px] text-gray-600 font-black uppercase tracking-widest mb-1">Course / Major</p>
              <p className="text-[11px] font-bold text-gray-300 uppercase">{intern.major || '—'}</p>
            </div>
            <div className="bg-[#0d1117] border border-gray-800 rounded-2xl p-4 min-w-[140px] hover:border-gray-700 transition-all">
              <p className="text-[8px] text-gray-600 font-black uppercase tracking-widest mb-1">Assigned Period</p>
              <p className="text-[11px] font-bold text-gray-300 uppercase">{intern.startDate} → {intern.endDate}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Attendance History */}
        <section className="bg-[#161b22] border border-gray-800 rounded-[3rem] overflow-hidden shadow-2xl animate-slide-up stagger-2 card-hover">
          <div className="px-8 py-8 border-b border-gray-800 bg-white/[0.02] flex justify-between items-center">
            <div>
              <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em]">Attendance Log</h2>
              <p className="text-[9px] text-gray-600 font-bold uppercase mt-1">Session-based activity history</p>
            </div>
            <span className="text-[9px] font-black bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg text-gray-500 uppercase hover-wiggle cursor-default">{groupedAttendance.length} Records</span>
          </div>
          
          <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar">
            {groupedAttendance.map((log) => (
              <div key={log.date} className="bg-[#0d1117] border border-gray-800 p-6 rounded-3xl group hover:border-red-500/30 transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover-pop">
                <div className="space-y-4 w-full sm:w-auto">
                  <div className="text-[11px] font-black text-gray-200 uppercase tracking-widest flex items-center">
                     <span className="w-1.5 h-1.5 bg-red-600 rounded-full mr-3 animate-pulse-glow"></span>
                     {log.date}
                  </div>
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="space-y-1">
                       <p className="text-[8px] text-gray-600 font-black uppercase tracking-[0.2em]">ຮອບເຊົ້າ</p>
                      <div className="font-mono text-[10px] font-bold flex items-center gap-2">
                        <div className="flex flex-col items-center">
                          <span className={`${
                            log.checkIn1 === '--:--' ? 'text-gray-800'
                            : log.checkIn1Late ? 'text-red-500' : 'text-green-500'
                          }`}>{log.checkIn1}</span>
                          {log.checkIn1Late && log.checkIn1 !== '--:--' && (
                            <span className="text-[7px] font-black text-red-500">ສາຍ</span>
                          )}
                        </div>
                        <span className="text-gray-800">→</span>
                        <div className="flex flex-col items-center">
                          <span className={`${
                            log.checkOut1 === '--:--' ? 'text-gray-800'
                            : log.checkOut1Early ? 'text-red-500' : 'text-orange-400'
                          }`}>{log.checkOut1}</span>
                          {log.checkOut1Early && log.checkOut1 !== '--:--' && (
                            <span className="text-[7px] font-black text-red-500">ອອກກ່ອນ</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] text-gray-600 font-black uppercase tracking-[0.2em]">ຮອບບ່າຍ</p>
                      <div className="font-mono text-[10px] font-bold flex items-center gap-2">
                        <div className="flex flex-col items-center">
                          <span className={`${
                            log.checkIn2 === '--:--' ? 'text-gray-800'
                            : log.checkIn2Late ? 'text-red-500' : 'text-green-500'
                          }`}>{log.checkIn2}</span>
                          {log.checkIn2Late && log.checkIn2 !== '--:--' && (
                            <span className="text-[7px] font-black text-red-500">ສາຍ</span>
                          )}
                        </div>
                        <span className="text-gray-800">→</span>
                        <div className="flex flex-col items-center">
                          <span className={`${
                            log.checkOut2 === '--:--' ? 'text-gray-800'
                            : log.checkOut2Early ? 'text-red-500' : 'text-orange-400'
                          }`}>{log.checkOut2}</span>
                          {log.checkOut2Early && log.checkOut2 !== '--:--' && (
                            <span className="text-[7px] font-black text-red-500">ອອກກ່ອນ</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                   <div className={`text-[8px] font-black uppercase px-3 py-1.5 rounded-xl border tracking-widest ${
                     log.status === 'Late'
                      ? 'bg-red-500/10 text-red-500 border-red-500/20'
                      : 'bg-green-500/10 text-green-500 border-green-500/20'
                   }`}>
                    {log.status === 'Late' ? 'ມາສາຍ' : 'ທັນເວລາ'}
                  </div>
                </div>
              </div>
            ))}
            {groupedAttendance.length === 0 && (
              <div className="py-20 text-center opacity-30">
                <p className="text-[10px] font-black uppercase tracking-[0.3em]">No activity logs discovered</p>
              </div>
            )}
          </div>
        </section>

        {/* Daily Reports */}
        <section className="bg-[#161b22] border border-gray-800 rounded-[3rem] overflow-hidden shadow-2xl animate-slide-up stagger-3 card-hover">
          <div className="px-8 py-8 border-b border-gray-800 bg-white/[0.02] flex justify-between items-center">
            <div>
              <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em]">Work Reports</h2>
              <p className="text-[9px] text-gray-600 font-bold uppercase mt-1">Daily task summaries and progress</p>
            </div>
            <span className="text-[9px] font-black bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg text-gray-500 uppercase hover-wiggle cursor-default">{reports.length} Reports</span>
          </div>
          
          <div className="p-4 space-y-6 max-h-[600px] overflow-y-auto custom-scrollbar">
            {reports.map((report) => (
              <div key={report.id} className="bg-[#0d1117] border border-gray-800 p-8 rounded-3xl group hover:border-red-500/30 transition-all hover-pop">
                <div className="flex justify-between items-start mb-4">
                  <div className="text-[11px] font-black text-red-500 uppercase tracking-[0.2em]">{report.date}</div>
                  <div className="text-[9px] font-mono text-gray-700 font-bold uppercase">{report.timeStr}</div>
                </div>
                <div className="h-[1px] w-10 bg-gray-800 mb-6 group-hover:w-20 group-hover:bg-red-900 transition-all"></div>
                <p className="text-[13px] text-gray-400 leading-relaxed font-lao">{report.content}</p>
              </div>
            ))}
            {reports.length === 0 && (
              <div className="py-20 text-center opacity-30">
                <p className="text-[10px] font-black uppercase tracking-[0.3em]">No reports filed yet</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ═══════════════ SKILLS EDITOR ═══════════════ */}
      <section className="bg-[#161b22] border border-gray-800 rounded-[3rem] overflow-hidden shadow-2xl animate-slide-up stagger-4 card-hover">
        <div className="px-8 py-8 border-b border-gray-800 bg-white/[0.02] flex justify-between items-center">
          <div>
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em]">🎯 Skills Track Editor</h2>
            <p className="text-[9px] text-gray-600 font-bold uppercase mt-1">ກຳໜົດທັກສະ ແລະ % ໃຫ້ Intern ຄົນນີ້</p>
          </div>
          <span className="text-[9px] font-black bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg text-gray-500 uppercase hover-bounce cursor-default">{skills.length} Skills</span>
        </div>

        <div className="p-8 space-y-5">
          {/* Skill rows */}
          {skills.length === 0 && (
            <div className="py-10 text-center opacity-30 animate-bounce-in">
              <p className="text-[11px] font-black uppercase tracking-widest text-gray-600">ຍັງບໍ່ທັນໃສ່ Skills — ກົດ + Add ລຸ່ມນີ້</p>
            </div>
          )}

          {skills.map((skill, idx) => (
            <div key={idx} className="bg-[#0d1117] border border-gray-800 rounded-2xl p-5 space-y-3 group hover:border-red-500/20 transition-all hover-pop">
              <div className="flex items-center gap-3">
                {/* Skill name */}
                <input
                  type="text"
                  value={skill.name}
                  placeholder="ຊື່ທັກສະ (e.g. Network Config)"
                  onChange={(e) => {
                    const updated = [...skills];
                    updated[idx] = { ...updated[idx], name: e.target.value };
                    setSkills(updated);
                  }}
                  className="fun-input flex-1 bg-[#161b22] border border-gray-700 text-gray-200 text-xs font-bold rounded-xl px-4 py-2.5 outline-none focus:border-red-500 transition-colors placeholder-gray-700"
                />
                {/* Percent number */}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={skill.percent}
                  onChange={(e) => {
                    const val = Math.min(100, Math.max(0, Number(e.target.value)));
                    const updated = [...skills];
                    updated[idx] = { ...updated[idx], percent: val };
                    setSkills(updated);
                  }}
                  className="fun-input w-16 bg-[#161b22] border border-gray-700 text-red-400 text-xs font-black rounded-xl px-3 py-2.5 text-center outline-none focus:border-red-500 transition-colors"
                />
                <span className="text-gray-600 text-xs font-black hover-wiggle">%</span>
                {/* Delete */}
                <button
                  onClick={() => setSkills(skills.filter((_, i) => i !== idx))}
                  className="text-gray-700 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-500/10 hover-bounce"
                  title="ລຶບທັກສະ"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              {/* Progress bar preview */}
              <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-red-600 to-red-400 h-full rounded-full transition-all duration-700 ease-in-out"
                  style={{ width: `${skill.percent}%` }}
                />
              </div>
            </div>
          ))}

          {/* Action buttons */}
          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={() => setSkills([...skills, { name: '', percent: 50 }])}
              className="hover-bounce flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-white bg-red-500/5 hover:bg-red-600 border border-red-500/20 hover:border-red-600 px-5 py-3 rounded-xl transition-all shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 4v16m8-8H4" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              Add Skill
            </button>

            <button
              disabled={skillsSaving}
              onClick={async () => {
                setSkillsSaving(true);
                setSkillsSaved(false);
                try {
                  // Validate: filter out empty-name skills
                  const clean = skills.filter(s => s.name.trim() !== '');
                  await updateDoc(doc(db, 'users', id), { skills: clean });
                  setSkills(clean);
                  setSkillsSaved(true);
                  setTimeout(() => setSkillsSaved(false), 3000);
                } catch (err) {
                  console.error('Save skills error:', err);
                  alert('ເກີດຂໍ້ຜິດພາດໃນການບັນທຶກ Skills');
                } finally {
                  setSkillsSaving(false);
                }
              }}
              className="btn-ripple hover-bounce flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white bg-green-600 hover:bg-green-500 px-5 py-3 rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-green-900/30"
            >
              {skillsSaving ? (
                <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> ກຳລັງບັນທຶກ...</>
              ) : skillsSaved ? (
                <><svg className="w-4 h-4 flex-shrink-0 animate-pop-in" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeWidth="2.5" strokeLinecap="round" /></svg> Saved!</>
              ) : (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> Save Skills</>
              )}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default InternDetailPage;
