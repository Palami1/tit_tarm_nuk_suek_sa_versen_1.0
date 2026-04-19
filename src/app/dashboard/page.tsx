'use client';

import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, query, where, getDocs, limit, updateDoc, doc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';

const DashboardPage = () => {
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [userName, setUserName] = useState('Intern');
  const [userId, setUserId] = useState('');
  const [distance, setDistance] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState('ກຳລັງດຶງ GPS...');
  const router = useRouter();

  useEffect(() => {
    let isSettled = false;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      isSettled = true;
      if (user) {
        setUserId(user.uid);
        // Fetch user profile from Firestore
        const userDoc = await getDocs(query(collection(db, 'users'), where('email', '==', user.email), limit(1)));
        if (!userDoc.empty) {
          const userData = userDoc.docs[0].data();

          // Role-based redirection: Admins should not be on the intern dashboard
          if (userData.role === 'admin') {
            router.replace('/admin/interns');
            return;
          }

          setUserName(userData.fullname || user.displayName || 'Intern');
        } else {
          setUserName(user.displayName || 'Intern');
        }
        checkTodayStatus(user.uid);
      } else {
        if (isSettled) {
          router.replace('/login');
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // ດຶງ GPS ແບບ Live (watchPosition) ອັບເດດທຸກຄັ້ງທີ່ user ເຄື່ອນທີ່
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus('ບໍ່ຮ່ວມຮັບ GPS');
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const d = calculateDistance(
          pos.coords.latitude,
          pos.coords.longitude,
          COMPANY_LOCATION.lat,
          COMPANY_LOCATION.lng
        );
        const dist = Math.round(d);
        setDistance(dist);
        setGpsStatus(dist <= GEOFENCE_LIMIT ? 'ພ້ອມລົງເວລາ (ຢູ່ໃນພື້ນທີ່)' : `ໄກເກີນ ${GEOFENCE_LIMIT}m — ບໍ່ສາມາດລົງເວລາໄດ້`);
      },
      () => setGpsStatus('ບໍ່ສາມາດເຂົ້າເຖິງ GPS ໄດ້'),
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const checkTodayStatus = async (uid: string) => {
    const today = new Date().toISOString().split('T')[0];

    // ດຶງຂໍ້ມູນການລົງເວລາທັງໝົດຂອງມື້ນີ້
    const q = query(
      collection(db, 'attendance'),
      where('userId', '==', uid),
      where('date', '==', today)
    );

    const snap = await getDocs(q);
    // ຈັດລຽງຂໍ້ມູນຕາມເວລາເຂົ້າວຽກຈາກເຊົ້າຫາແລງ
    const toStr = (t: any) =>
      t && typeof t.toDate === 'function' ? t.toDate().toISOString() : String(t ?? '');
    const sortedSessions = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => toStr(a.checkInTime).localeCompare(toStr(b.checkInTime)));

    setSessions(sortedSessions);
  };

  const COMPANY_LOCATION = { lat: 17.969900946492515, lng: 102.6123789072009 };
  const GEOFENCE_LIMIT = 200; // ແມັດ
  const CHECK_IN_CUTOFF = '08:00';

  // ຟັງຊັນຄິດໄລ່ໄລຍະຫ່າງ GPS (ແມັດ)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const isCheckedIn = sessions.length > 0 && !sessions[sessions.length - 1].checkOutTime;
  const isAllDone = sessions.length >= 2 && Boolean(sessions[sessions.length - 1]?.checkOutTime);
  const isOutside = distance === null || distance > GEOFENCE_LIMIT;

  const handleCheckIn = async () => {
    if (!userId || loading || isCheckedIn || isAllDone) {
      if (isAllDone) alert('ທ່ານໄດ້ລົງເວລາຄົບ 2 ເທື່ອແລ້ວໃນມື້ນີ້');
      else if (isCheckedIn) alert('ທ່ານໄດ້ລົງເວລາເຂົ້າວຽກແລ້ວ');
      return;
    }

    // ✅ Security Check: ກວດໄລຍະທາງຈາກ watchPosition state
    if (distance === null) {
      alert('ກຳລັງດຶງ GPS... ກະລຸນາລໍຖ້າ');
      return;
    }
    if (distance > GEOFENCE_LIMIT) {
      alert('ຂໍອະໄພ, ທ່ານຢູ່ໄກຈາກຫ້ອງການ ' + distance + ' ແມັດ (ຕ້ອງຢູ່ພາຍໃນ ' + GEOFENCE_LIMIT + 'm)');
      return;
    }

    setLoading(true);
    try {
      // ✅ Firestore Double-Check: ກວດຈຳນວນຄັ້ງຂອງມື້ນີ້ຈາກ Server ໂດຍກົງ
      const today = new Date().toISOString().split('T')[0];
      const serverCheck = await getDocs(query(
        collection(db, 'attendance'),
        where('userId', '==', userId),
        where('date', '==', today)
      ));
      if (serverCheck.size >= 2) {
        alert('ທ່ານໄດ້ລົງເວລາຄົບ 2 ຮອບແລ້ວສຳລັບມື້ນີ້');
        setLoading(false);
        return;
      }

      // ດຶງ GPS coordinates ຈາກ watchPosition ໂດຍກົງ (ໃຊ້ getCurrentPosition ສຳລັບ precise fix)
      // Optimize Geolocation Options for speed and accuracy
      const geoOptions = {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 30000 // Ues cached position if it's less than 30s old
      };

      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        const finalDist = calculateDistance(latitude, longitude, COMPANY_LOCATION.lat, COMPANY_LOCATION.lng);

        // ກວດ GPS ຄັ້ງສຸດທ້າຍກ່ອນ Save (ປ້ອງກັນ GPS drift)
        if (finalDist > GEOFENCE_LIMIT) {
          alert('ທ່ານບໍ່ໄດ້ຢູ່ໃນສະຖານທີ່ (ໄລຍະຫ່າງ: ' + Math.round(finalDist) + ' ແມັດ)');
          setLoading(false);
          return;
        }

        const now = new Date();
        const [hours, minutes] = CHECK_IN_CUTOFF.split(':').map(Number);
        const cutoff = new Date();
        cutoff.setHours(hours, minutes, 0, 0);

        const status = (now > cutoff) ? 'Late' : 'On-time';
        const workStatus = finalDist <= GEOFENCE_LIMIT ? 'On-Site' : 'Remote';
        const checkInType = now.getHours() < 12 ? 'Morning' : 'Afternoon';

        const docRef = await addDoc(collection(db, 'attendance'), {
          userId,
          internId: userId,
          userName,
          date: today,
          checkInTime: now.toISOString(),
          checkOutTime: null,
          status,
          workStatus,
          checkInDistance: Math.round(finalDist),
          checkInType,
          type: 'check-in',
          timestamp: serverTimestamp(),
          coordinates: { latitude, longitude },
          deviceInfo: navigator.userAgent
        });

        const newSession = {
          id: docRef.id,
          userId,
          date: today,
          checkInTime: now.toISOString(),
          checkOutTime: null,
          status,
          workStatus,
          coordinates: { latitude, longitude },
          deviceInfo: navigator.userAgent
        };

        setSessions([...sessions, newSession]);
        alert('ລົງເວລາເຂົ້າວຽກສຳເລັດ! (' + status + ')');
        setLoading(false);
      }, (geoErr) => {
        console.error('GPS Error:', geoErr);
        alert('ກະລຸນາເປີດການນຳໃຊ້ GPS ຫຼື ຍ້າຍໄປບ່ອນທີ່ຮັບສັນຍານໄດ້ດີ');
        setLoading(false);
      }, geoOptions);
    } catch (err) {
      console.error(err);
      alert('ເກີດຂໍ້ຜິດພາດໃນການລົງເວລາ');
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    // ຕ້ອງໄດ້ເຂົ້າວຽກກ່ອນຈຶ່ງຈະອອກໄດ້
    if (!userId || loading || !isCheckedIn) {
      if (!isCheckedIn) alert('ທ່ານຕ້ອງລົງເວລາເຂົ້າວຽກກ່ອນ');
      return;
    }
    setLoading(true);
    try {
      if (!navigator.geolocation) {
        alert('ໂປຣແກຣມທ່ອງເວັບຂອງທ່ານບໍ່ຮ່ວມຮັບ GPS');
        setLoading(false);
        return;
      }

      // Optimize Geolocation Options for speed and accuracy
      const geoOptions = {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 30000 
      };

      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        const distance = calculateDistance(latitude, longitude, COMPANY_LOCATION.lat, COMPANY_LOCATION.lng);

        // ກວດສອບໄລຍະຫ່າງຕອນອອກວຽກ
        if (distance > GEOFENCE_LIMIT) {
          alert('ທ່ານບໍ່ໄດ້ຢູ່ໃນສະຖານທີ່ເຮັດວຽກ (ໄລຍະຫ່າງ: ' + Math.round(distance) + ' ແມັດ)');
          setLoading(false);
          return;
        }

        const currentSession = sessions[sessions.length - 1];
        const now = new Date().toISOString();

        // ອັບເດດເວລາອອກວຽກໃນ Firestore
        await updateDoc(doc(db, 'attendance', currentSession.id), {
          checkOutTime: now,
          type: 'check-out',          // ✅ ປ່ຽນສະຖານະເປັນ Check-out
          timestamp: serverTimestamp() // ✅ ອັບເດດເວລາຫຼ້າສຸດໃຫ້ Admin ເຫັນ
        });

        const updatedSessions = [...sessions];
        updatedSessions[sessions.length - 1].checkOutTime = now;
        setSessions(updatedSessions);

        alert('ລົງເວລາເລີກວຽກສຳເລັດ!');
        setLoading(false);
      }, (geoErr) => {
        console.error('GPS Error:', geoErr);
        alert('ກະລຸນາເປີດການນຳໃຊ້ GPS ຫຼື ຍ້າຍໄປບ່ອນທີ່ຮັບສັນຍານໄດ້ດີ');
        setLoading(false);
      }, geoOptions);
    } catch (err) {
      console.error(err);
      alert('ເກີດຂໍ້ຜິດພາດໃນການລົງເວລາ');
      setLoading(false);
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report.trim() || !userId) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'daily_reports'), {
        userId,
        userName,
        content: report,
        timestamp: serverTimestamp(),
        date: new Date().toISOString().split('T')[0],
      });
      setReport('');
      alert('ສົ່ງລາຍງານສຳເລັດ!');
    } catch (err) {
      console.error(err);
      alert('ເກີດຂໍ້ຜິດພາດໃນການສົ່ງລາຍງານ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-slide-up">
      <section className="animate-slide-up stagger-1 bg-white rounded-[2rem] p-6 card-shadow card-hover flex items-center space-x-5 border border-gray-50">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-red-50 p-0.5 overflow-hidden">
            <img
              alt="Profile"
              className="w-full h-full rounded-2xl object-cover shadow-inner"
              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userName}`}
            />
          </div>
          <span className="absolute -bottom-1 -right-1 block h-4 w-4 rounded-full ring-4 ring-white bg-green-500"></span>
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-[#1a2b4b]">{userName}</h2>
          <p className="text-xs font-bold text-red-600/70 uppercase tracking-widest">LTC Intern • ID: 2024-001</p>
        </div>
      </section>

      <section className="animate-slide-up stagger-2 ltc-red-gradient card-hover rounded-[2.5rem] p-8 shadow-xl shadow-red-100 text-white text-center relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-[10px] font-bold text-white/60 uppercase tracking-[0.3em] mb-3">Distance to LTC HQ</p>
          <h1 className="text-5xl font-black mb-3">
            {distance === null ? '...' : `${distance} m`}
          </h1>
          <div className={`inline-flex items-center px-4 py-2 bg-black/10 rounded-full text-xs font-bold border border-white/20 backdrop-blur-md`}>
            <span className={`h-2 w-2 rounded-full mr-2 animate-pulse ${distance !== null && distance <= 100 ? 'bg-green-400' : 'bg-red-400'}`}></span>
            {gpsStatus}
          </div>
        </div>
        <div className="absolute -right-8 -bottom-8 opacity-10">
          <img src="https://ltc.laotel.com/BBLogo/LTC%20logo%20sign.png" className="w-40 brightness-0 invert" alt="Logo BG" />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 animate-slide-up stagger-3">
        <button
          onClick={handleCheckIn}
          disabled={isCheckedIn || isAllDone || loading || isOutside}
          className={`hover-pop bg-white p-8 rounded-[2rem] card-shadow flex flex-col items-center justify-center space-y-4 border-2 border-transparent transition-all group ${(isCheckedIn || isAllDone || isOutside) ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:border-red-500'}`}
        >
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${(isCheckedIn || isAllDone || isOutside) ? 'bg-gray-100 text-gray-400' : 'bg-red-50 text-red-600 group-hover:bg-red-600 group-hover:text-white'}`}>
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M11 16l-4-4m0 0l4-4m-4 4h14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="text-center">
            <div className={`font-bold ${(isCheckedIn || isAllDone || isOutside) ? 'text-gray-400' : 'text-gray-800'}`}>Check-in</div>
            <div className={`text-[10px] uppercase font-bold ${(isCheckedIn || isAllDone || isOutside) ? 'text-gray-300' : 'text-gray-400'}`}>
              ຄັ້ງທີ {sessions.length + (isCheckedIn ? 0 : 1)}
            </div>
          </div>
        </button>

        <button
          onClick={handleCheckOut}
          disabled={!isCheckedIn || loading || isOutside}
          className={`hover-pop bg-white p-8 rounded-[2rem] card-shadow flex flex-col items-center justify-center space-y-4 border-2 border-transparent transition-all group ${(!isCheckedIn || isOutside) ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:border-gray-800'}`}
        >
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${(!isCheckedIn || isOutside) ? 'bg-gray-100 text-gray-400' : 'bg-gray-50 text-gray-600 hover:bg-gray-800 hover:text-white'}`}>
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M17 16l4-4m0 0l-4-4m4 4H7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="text-center">
            <div className={`font-bold ${(!isCheckedIn || isOutside) ? 'text-gray-400' : 'text-gray-800'}`}>Check-out</div>
            <div className={`text-[10px] uppercase font-bold ${(!isCheckedIn || isOutside) ? 'text-gray-300' : 'text-gray-400'}`}>
              ຄັ້ງທີ {sessions.length}
            </div>
          </div>
        </button>
      </section>

      <section className="bg-white rounded-[2rem] p-6 card-shadow border border-gray-50 animate-slide-up stagger-4 card-hover">
        <form onSubmit={handleReportSubmit}>
          <div className="flex items-center space-x-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="2" />
              </svg>
            </div>
            <h3 className="text-md font-bold text-[#1a2b4b]">ລາຍງານວຽກປະຈຳວັນ</h3>
          </div>
          <textarea
            className="block w-full rounded-2xl border-gray-100 bg-gray-50 focus:ring-red-500 focus:border-red-500 p-4 text-gray-600 text-sm mb-5 min-h-[120px] outline-none"
            placeholder="ມື້ນີ້ທ່ານໄດ້ຮຽນຮູ້ ຫຼື ເຮັດວຽກຫຍັງແດ່?"
            value={report}
            onChange={(e) => setReport(e.target.value)}
            required
          ></textarea>
          <button
            type="submit"
            disabled={loading || sessions.length === 0}
            className="btn-ripple w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-red-100 hover:shadow-red-200 active:scale-[0.97] transition-all disabled:opacity-50"
          >
            {loading ? 'ກຳລັງສົ່ງ...' : 'ສົ່ງລາຍງານວຽກ'}
          </button>
        </form>
      </section>
      {/* Today Activity Section */}
      <section className="bg-white rounded-[2rem] p-6 card-shadow border border-gray-50 animate-slide-up stagger-5 hover-bounce">
        <div className="flex items-center space-x-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="2" />
            </svg>
          </div>
          <h3 className="text-md font-bold text-[#1a2b4b]">ສະຫຼຸບການລົງເວລາພາຍໃນມື້ນີ້</h3>
        </div>
        <div className="space-y-3">
          {sessions.length > 0 ? sessions.map((s, i) => (
            <div key={s.id || i} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <div className="flex items-center space-x-4">
                <div className={`w-2 h-2 rounded-full animate-pulse ${s.checkOutTime ? 'bg-gray-300' : 'bg-green-500'}`}></div>
                <div>
                  <div className="text-xs font-bold text-gray-800">ຮອບທີ {i + 1}</div>
                  <div className="text-[10px] text-gray-400 font-mono">
                    {s.checkInTime ? new Date(s.checkInTime).toLocaleTimeString('lo-LA', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                    {s.checkOutTime ? ` - ${new Date(s.checkOutTime).toLocaleTimeString('lo-LA', { hour: '2-digit', minute: '2-digit' })}` : ' (ກຳລັງເຮັດວຽກ)'}
                  </div>
                </div>
              </div>
              <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase ${s.status === 'Late' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                {s.status}
              </span>
            </div>
          )) : (
            <div className="text-center py-6 text-gray-400 text-xs italic">ຍັງບໍ່ມີການລົງເວລາສຳລັບມື້ນີ້</div>
          )}
        </div>
      </section>
    </div>
  );
};

export default DashboardPage;
