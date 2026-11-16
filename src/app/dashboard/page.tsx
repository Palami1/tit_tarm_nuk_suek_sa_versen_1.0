'use client';

import React, { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { calculateDistance, findNearestOffice, DEFAULT_OFFICES, DEFAULT_SYSTEM_SETTINGS } from '@/lib/attendance-rules';
import { AttendanceRecord, DailyReport, SystemSettings, UserProfile } from '@/types';

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [reportText, setReportText] = useState('');
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SYSTEM_SETTINGS);
  
  // GPS State
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [isInside, setIsInside] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [isInsecureOrigin, setIsInsecureOrigin] = useState(false);
  
  // UI Action State
  const [submitting, setSubmitting] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [todayDateStr, setTodayDateStr] = useState('');

  // 1. Live Clock (Asia/Vientiane)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeStr(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      setTodayDateStr(`${y}-${m}-${d}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // 2. Fetch User Profile and Today's Attendance & Report
  useEffect(() => {
    let unsubscribeUser: (() => void) | undefined;
    let unsubscribeAttendance: (() => void) | undefined;
    let unsubscribeReport: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      // Realtime listener for User Profile
      unsubscribeUser = onSnapshot(doc(db, 'users', user.uid), (snap) => {
        if (snap.exists()) {
          setProfile({ uid: snap.id, ...snap.data() } as UserProfile);
        }
      });

      // Calculate today's doc ID
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const todayDate = `${y}-${m}-${d}`;
      const docId = `${user.uid}_${todayDate}`;

      // Realtime listener for Attendance
      unsubscribeAttendance = onSnapshot(doc(db, 'attendance', docId), (snap) => {
        if (snap.exists()) {
          setAttendance({ id: snap.id, ...snap.data() } as AttendanceRecord);
        } else {
          setAttendance(null);
        }
      });

      // Realtime listener for Daily Report
      unsubscribeReport = onSnapshot(doc(db, 'daily_reports', docId), (snap) => {
        if (snap.exists()) {
          const r = { id: snap.id, ...snap.data() } as DailyReport;
          setDailyReport(r);
          setReportText(r.report || '');
        } else {
          setDailyReport(null);
        }
      });

      // Fetch System Settings from API
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/attendance/today', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.settings) setSettings(data.settings);
        }
      } catch (e) {
        console.warn('Could not fetch settings from API, using defaults');
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) unsubscribeUser();
      if (unsubscribeAttendance) unsubscribeAttendance();
      if (unsubscribeReport) unsubscribeReport();
    };
  }, []);

  // 2.5 Insecure context detector
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isSec = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      setIsInsecureOrigin(!isSec);
    }
  }, []);

  // 3. Live GPS watchPosition
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('ອຸປະກອນຂອງທ່ານບໍ່ຮອງຮັບລະບົບ GPS');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (isSimulated) return;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy;

        setCoords({ lat, lng });
        setAccuracy(Math.round(acc));
        setGpsError(null);

        // Find nearest office
        const offices = settings.offices?.length ? settings.offices : DEFAULT_OFFICES;
        const nearest = findNearestOffice({ lat, lng }, offices);
        setDistance(nearest.distance);
        setIsInside(nearest.isInside);
      },
      (err) => {
        if (isSimulated) return;
        console.error('GPS watch error:', err);
        if (typeof window !== 'undefined' && !window.isSecureContext) {
          setGpsError('Browser ບລັອກ GPS ເນື່ອງຈາກກຳລັງເປີດຜ່ານ HTTP (Insecure Context). ກະລຸນາເຂົ້າຜ່ານ HTTPS ຫຼື ໃຊ້ປຸ່ມຈຳລອງພິກັດດ້ານລຸ່ມເພື່ອທົດສອບ');
        } else {
          setGpsError('ບໍ່ສາມາດເຂົ້າເຖິງ GPS ໄດ້ ກະລຸນາເປີດສະຖານທີ່ (Location Service)');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 15000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [settings, isSimulated]);

  // Toggle simulation mode for Office / VPN testing
  const handleToggleSimulateHQ = () => {
    if (!isSimulated) {
      const hqLat = settings.offices?.[0]?.lat || DEFAULT_OFFICES[0].lat;
      const hqLng = settings.offices?.[0]?.lng || DEFAULT_OFFICES[0].lng;
      setCoords({ lat: hqLat, lng: hqLng });
      setAccuracy(5);
      setDistance(0);
      setIsInside(true);
      setGpsError(null);
      setIsSimulated(true);
    } else {
      setIsSimulated(false);
      setCoords(null);
      setAccuracy(null);
      setDistance(null);
      setIsInside(false);
    }
  };

  // Handle Check-in via Server API
  const handleCheckIn = async () => {
    if (!coords || submitting) return;

    try {
      setSubmitting(true);
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const token = await currentUser.getIdToken();

      const res = await fetch('/api/attendance/check-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          latitude: coords.lat,
          longitude: coords.lng,
          accuracy: accuracy || 10,
          deviceInfo: navigator.userAgent,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'ການລົງເວລາເຂົ້າວຽກບໍ່ສຳເລັດ');
      }

      alert(resJson.message || 'ລົງເວລາເຂົ້າວຽກສຳເລັດ!');
    } catch (err: any) {
      console.error(err);
      alert('ຂໍ້ຜິດພາດ: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Check-out via Server API
  const handleCheckOut = async () => {
    if (!coords || submitting) return;

    try {
      setSubmitting(true);
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const token = await currentUser.getIdToken();

      const res = await fetch('/api/attendance/check-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          latitude: coords.lat,
          longitude: coords.lng,
          accuracy: accuracy || 10,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'ການລົງເວລາອອກວຽກບໍ່ສຳເລັດ');
      }

      alert(resJson.message || 'ລົງເວລາອອກວຽກສຳເລັດ!');
    } catch (err: any) {
      console.error(err);
      alert('ຂໍ້ຜິດພາດ: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Daily Report Submit via Server API
  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportText.trim() || submittingReport) return;

    try {
      setSubmittingReport(true);
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const token = await currentUser.getIdToken();

      const res = await fetch('/api/reports/daily', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ report: reportText }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'ສົ່ງລາຍງານບໍ່ສຳເລັດ');
      }

      alert(resJson.message || 'ສົ່ງລາຍງານປະຈຳວັນສຳເລັດ!');
    } catch (err: any) {
      console.error(err);
      alert('ຂໍ້ຜິດພາດ: ' + err.message);
    } finally {
      setSubmittingReport(false);
    }
  };

  // Format Helper
  const formatTimeOnly = (isoString?: string | null) => {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  // State calculations
  const hasCheckedIn = Boolean(attendance?.checkInTime);
  const hasCheckedOut = Boolean(attendance?.checkOutTime);
  const isAccurate = accuracy !== null && accuracy <= (settings.maxGpsAccuracy || 50);

  // Time window checks for client UX
  const timeToSec = (t: string) => {
    const [h, m, s] = t.split(':').map(Number);
    return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
  };
  const curSec = timeToSec(currentTimeStr || '00:00:00');
  const inFromSec = timeToSec(settings.checkInWindow?.from || '06:00');
  const inToSec = timeToSec(settings.checkInWindow?.to || '12:00');
  const outFromSec = timeToSec(settings.checkOutWindow?.from || '12:00');
  const outToSec = timeToSec(settings.checkOutWindow?.to || '22:00');

  const inWindowForCheckIn = curSec >= inFromSec && curSec <= inToSec;
  const inWindowForCheckOut = curSec >= outFromSec && curSec <= outToSec;

  const canClickCheckIn = !hasCheckedIn && isInside && isAccurate && inWindowForCheckIn && !submitting;
  const canClickCheckOut = hasCheckedIn && !hasCheckedOut && isInside && isAccurate && inWindowForCheckOut && !submitting;

  return (
    <div className="space-y-6 pb-12 font-lao animate-slide-up">
      {/* 1. Profile Header Card */}
      <section className="bg-white rounded-3xl p-6 card-shadow border border-gray-100 flex flex-col sm:flex-row items-center gap-5">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-red-50 p-1 overflow-hidden shadow-inner border border-red-100">
            <img
              alt="Avatar"
              className="w-full h-full rounded-xl object-cover"
              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.fullname || 'Intern'}`}
            />
          </div>
          <span className="absolute -bottom-1 -right-1 block h-4 w-4 rounded-full ring-4 ring-white bg-emerald-500"></span>
        </div>

        <div className="flex-1 text-center sm:text-left space-y-1">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <h2 className="text-xl font-black text-gray-900">{profile?.fullname || 'ນັກສຶກສາຝຶກງານ'}</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800 border border-green-200">
              ACTIVE
            </span>
          </div>
          <p className="text-xs text-gray-500">
            {profile?.college || 'ມະຫາວິທະຍາໄລ'} {profile?.major ? `• ສາຂາ ${profile.major}` : ''}
          </p>
          <div className="text-[11px] text-gray-400">
            ໄລຍະຝຶກງານ: <span className="font-semibold text-gray-700">{profile?.startDate || '—'}</span> ຫາ{' '}
            <span className="font-semibold text-gray-700">{profile?.endDate || '—'}</span>
          </div>
        </div>

        <div className="text-right hidden sm:block border-l border-gray-100 pl-6">
          <div className="text-2xl font-black text-red-600 font-mono tracking-wider">{currentTimeStr || '--:--:--'}</div>
          <div className="text-[11px] text-gray-400 font-bold">{todayDateStr}</div>
        </div>
      </section>

      {/* 2. GPS & Geofence Status Card */}
      <section className="ltc-red-gradient rounded-[2.5rem] p-8 shadow-xl shadow-red-200 text-white text-center relative overflow-hidden">
        <div className="relative z-10 space-y-2">
          <p className="text-[11px] font-bold text-white/70 uppercase tracking-[0.3em]">
            ໄລຍະຫ່າງຈາກສຳນັກງານໃຫຍ່ (LTC HQ)
          </p>
          <h1 className="text-5xl font-black tracking-tight">
            {distance === null ? '...' : `${distance} ແມັດ`}
          </h1>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
            {/* Geofence Status Badge */}
            <div className="inline-flex items-center px-4 py-1.5 bg-black/20 rounded-full text-xs font-bold border border-white/20 backdrop-blur-md">
              <span
                className={`h-2.5 w-2.5 rounded-full mr-2 ${
                  isInside ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
                }`}
              ></span>
              {isInside ? 'ພ້ອມລົງເວລາ (ຢູ່ໃນພື້ນທີ່)' : `ຢູ່ນອກພື້ນທີ່ (ຕ້ອງ <= ${settings.offices?.[0]?.radius || 200}m)`}
            </div>

            {/* GPS Accuracy Badge */}
            {accuracy !== null && (
              <div
                className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border ${
                  isAccurate
                    ? 'bg-black/20 text-white/90 border-white/20'
                    : 'bg-amber-500/30 text-amber-200 border-amber-300/40'
                }`}
              >
                <span>GPS Accuracy: ±{accuracy}m</span>
                {!isAccurate && <span className="ml-1 text-[10px]">(ສັນຍານອ່ອນ)</span>}
              </div>
            )}
          </div>

          {/* Office / VPN Test Mode Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleToggleSimulateHQ}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition-all ${
                isSimulated
                  ? 'bg-amber-400 text-gray-900 border-amber-300 shadow-md'
                  : 'bg-white/10 hover:bg-white/20 text-white/90 border-white/20'
              }`}
            >
              {isSimulated ? '📍 ກຳລັງຈຳລອງພິກັດ LTC HQ (ກົດເພື່ອປິດ)' : '📍 ຈຳລອງພິກັດຢູ່ສຳນັກງານໃຫຍ່ (ສຳລັບທົດສອບຜ່ານ VPN)'}
            </button>
          </div>

          {gpsError && (
            <p className="text-xs text-amber-200 font-bold mt-2 bg-black/30 p-2 rounded-xl inline-block">
              ⚠️ {gpsError}
            </p>
          )}

          {isInsecureOrigin && !isSimulated && (
            <div className="mt-3 p-3 rounded-2xl bg-black/40 border border-amber-400/30 text-amber-200 text-left text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <span>ℹ️</span>
                <span>ກຳລັງເຂົ້າໃຊ້ຜ່ານ HTTP ພາຍໃນ (Insecure Context)</span>
              </div>
              <p className="text-[11px] text-white/80 leading-relaxed">
                Browser ມັກຈະບລັອກ GPS ຖ້າບໍ່ແມ່ນ HTTPS. ທ່ານສາມາດກົດປຸ່ມ <b>&quot;ຈຳລອງພິກັດຢູ່ສຳນັກງານໃຫຍ່&quot;</b> ດ້ານເທິງເພື່ອທົດສອບລົງເວລາໄດ້ທັນທີ.
              </p>
            </div>
          )}
        </div>

        <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
          <img
            src="https://ltc.laotel.com/BBLogo/LTC%20logo%20sign.png"
            className="w-48 brightness-0 invert"
            alt="LTC Logo Watermark"
          />
        </div>
      </section>

      {/* 3. Single Dynamic Attendance Button Card */}
      <section className="bg-white rounded-3xl p-6 card-shadow border border-gray-100 space-y-6">
        <div className="border-b border-gray-100 pb-4 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-black text-gray-900">ການລົງເວລາປະຈຳວັນ (Attendance)</h3>
            <p className="text-xs text-gray-400">ລະບົບ 1 ຄູ່ຕໍ່ມື້ (Check-in ຕອນເຊົ້າ ແລະ Check-out ຕອນເລີກວຽກ)</p>
          </div>
          <div className="text-right text-xs">
            <span className="text-gray-400">ຕັດເວລາເຂົ້າ: </span>
            <span className="font-bold text-red-600">{settings.workStart} AM</span>
          </div>
        </div>

        {/* Attendance Summary Status Bar (if any session recorded) */}
        {hasCheckedIn && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100 text-xs">
            <div>
              <span className="text-gray-400 block font-semibold">ເວລາເຂົ້າວຽກ (In):</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-bold text-gray-800 text-sm">{formatTimeOnly(attendance?.checkInTime)}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    attendance?.checkInStatus === 'on-time'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {attendance?.checkInStatus === 'on-time' ? 'ທັນເວລາ' : 'ມາຊ້າ'}
                </span>
              </div>
            </div>

            <div>
              <span className="text-gray-400 block font-semibold">ເວລາອອກວຽກ (Out):</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-bold text-gray-800 text-sm">
                  {hasCheckedOut ? formatTimeOnly(attendance?.checkOutTime) : 'ຍັງບໍ່ໄດ້ Check-out'}
                </span>
                {hasCheckedOut && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      attendance?.checkOutStatus === 'normal'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {attendance?.checkOutStatus === 'normal' ? 'ປົກກະຕິ' : 'ອອກກ່ອນເວລາ'}
                  </span>
                )}
              </div>
            </div>

            <div>
              <span className="text-gray-400 block font-semibold">ໄລຍະຫ່າງຕອນລົງເວລາ:</span>
              <span className="font-bold text-gray-800 text-sm mt-0.5 block">
                {attendance?.checkInDistance} ແມັດ
              </span>
            </div>
          </div>
        )}

        {/* Dynamic Action Button */}
        <div className="flex flex-col items-center justify-center p-4">
          {!hasCheckedIn ? (
            // State 1: Need Check-in
            <div className="w-full max-w-md text-center space-y-3">
              <button
                onClick={handleCheckIn}
                disabled={!canClickCheckIn}
                className={`w-full py-5 rounded-2xl font-black text-base shadow-lg transition-all flex items-center justify-center gap-3 ${
                  canClickCheckIn
                    ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-red-200 active:scale-95'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200 shadow-none'
                }`}
              >
                <span className="text-2xl">📍</span>
                <span>{submitting ? 'ກຳລັງບັນທຶກ...' : 'ລົງເວລາເຂົ້າວຽກ (Check-in)'}</span>
              </button>

              <div className="text-xs text-gray-400 space-y-1">
                <div>
                  ຊ່ວງເວລາທີ່ກົດໄດ້: <span className="font-bold text-gray-700">{settings.checkInWindow.from} ຫາ {settings.checkInWindow.to}</span>
                </div>
                {!inWindowForCheckIn && (
                  <div className="text-amber-600 font-bold">⚠️ ປັດຈຸບັນຢູ່ນອກຊ່ວງເວລາ Check-in</div>
                )}
                {!isInside && (
                  <div className="text-red-500 font-bold">⚠️ ທ່ານຢູ່ນອກລັດສະໝີທີ່ອະນຸຍາດ (ຕ້ອງ &lt;= 200m)</div>
                )}
                {!isAccurate && (
                  <div className="text-amber-600 font-bold">⚠️ ສັນຍານ GPS ຍັງບໍ່ແມ່ນຍຳພໍ (Accuracy &gt; 50m)</div>
                )}
              </div>
            </div>
          ) : !hasCheckedOut ? (
            // State 2: Checked in, waiting for Check-out
            <div className="w-full max-w-md text-center space-y-3">
              <button
                onClick={handleCheckOut}
                disabled={!canClickCheckOut}
                className={`w-full py-5 rounded-2xl font-black text-base shadow-lg transition-all flex items-center justify-center gap-3 ${
                  canClickCheckOut
                    ? 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-indigo-200 active:scale-95'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200 shadow-none'
                }`}
              >
                <span className="text-2xl">🏁</span>
                <span>{submitting ? 'ກຳລັງບັນທຶກ...' : 'ລົງເວລາອອກວຽກ (Check-out)'}</span>
              </button>

              <div className="text-xs text-gray-400 space-y-1">
                <div>
                  ຊ່ວງເວລາທີ່ກົດໄດ້: <span className="font-bold text-gray-700">{settings.checkOutWindow.from} ຫາ {settings.checkOutWindow.to}</span> (ເລີກວຽກປົກກະຕິ: {settings.workEnd})
                </div>
                {!inWindowForCheckOut && (
                  <div className="text-amber-600 font-bold">⚠️ ປັດຈຸບັນຍັງບໍ່ຮອດຊ່ວງເວລາ Check-out (ເລີ່ມ {settings.checkOutWindow.from})</div>
                )}
                {!isInside && (
                  <div className="text-red-500 font-bold">⚠️ ທ່ານຢູ່ນອກລັດສະໝີທີ່ອະນຸຍາດ (ຕ້ອງ &lt;= 200m)</div>
                )}
              </div>
            </div>
          ) : (
            // State 3: Completed for today
            <div className="w-full max-w-md text-center p-6 bg-emerald-50/50 rounded-2xl border border-emerald-200 space-y-2">
              <div className="text-4xl">🎉</div>
              <h4 className="text-base font-black text-emerald-800">ທ່ານໄດ້ລົງເວລາຄົບຖ້ວນແລ້ວໃນມື້ນີ້</h4>
              <p className="text-xs text-emerald-600 leading-relaxed">
                Check-in: {formatTimeOnly(attendance?.checkInTime)} | Check-out: {formatTimeOnly(attendance?.checkOutTime)}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 4. Daily Task Report Section */}
      <section className="bg-white rounded-3xl p-6 card-shadow border border-gray-100 space-y-4">
        <div className="flex justify-between items-center border-b border-gray-100 pb-4">
          <div>
            <h3 className="text-lg font-black text-gray-900">ລາຍງານການປະຕິບັດວຽກປະຈຳວັນ (Daily Report)</h3>
            <p className="text-xs text-gray-400">
              ບັນທຶກວຽກທີ່ໄດ້ເຮັດໃນມື້ນີ້ (ສົ່ງໄດ້ສະເພາະມື້ທີ່ມີ Check-in ແລະ ແກ້ໄຂໄດ້ພາຍໃນມື້ນັ້ນ)
            </p>
          </div>
          {dailyReport && (
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                dailyReport.reviewStatus === 'approved'
                  ? 'bg-emerald-100 text-emerald-800'
                  : dailyReport.reviewStatus === 'needs-revision'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-blue-100 text-blue-800'
              }`}
            >
              {dailyReport.reviewStatus === 'approved'
                ? '✓ ກວດແລ້ວ (Approved)'
                : dailyReport.reviewStatus === 'needs-revision'
                ? '⚠️ ສົ່ງກັບໃຫ້ແກ້ໄຂ'
                : '⏳ ລໍຖ້າກວດ (Pending)'}
            </span>
          )}
        </div>

        {/* Admin Feedback Box if needs revision or commented */}
        {dailyReport?.adminComment && (
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-1">
            <span className="font-bold flex items-center gap-1.5">
              <span>💬</span>
              <span>ຄຳຕິຊົມຈາກຫົວໜ້າທີມ (Admin):</span>
            </span>
            <p className="italic pl-5">{dailyReport.adminComment}</p>
          </div>
        )}

        <form onSubmit={handleReportSubmit} className="space-y-4">
          <div>
            <textarea
              rows={4}
              disabled={!hasCheckedIn || submittingReport}
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              placeholder={
                hasCheckedIn
                  ? 'ຂຽນບົດລາຍງານການປະຕິບັດວຽກຂອງທ່ານໃນມື້ນີ້ (ເຊັ່ນ: ວຽກທີ່ເຮັດສຳເລັດ, ບັນຫາທີ່ພົບ, ສິ່ງທີ່ໄດ້ຮຽນຮູ້)...'
                  : '⚠️ ທ່ານຕ້ອງລົງເວລາເຂົ້າວຽກ (Check-in) ໃນມື້ນີ້ກ່ອນ ຈຶ່ງຈະສາມາດສົ່ງລາຍງານປະຈຳວັນໄດ້'
              }
              className={`w-full p-4 rounded-2xl border text-xs focus:outline-none transition-all leading-relaxed ${
                hasCheckedIn
                  ? 'border-gray-200 bg-gray-50/50 focus:border-red-500 focus:bg-white text-gray-800'
                  : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            />
          </div>

          <div className="flex justify-between items-center">
            <div className="text-[11px] text-gray-400">
              {dailyReport?.updatedAt ? `ອັບເດດຫຼ້າສຸດ: ${formatTimeOnly(dailyReport.updatedAt)}` : ''}
            </div>

            <button
              type="submit"
              disabled={!hasCheckedIn || !reportText.trim() || submittingReport}
              className={`px-6 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all ${
                hasCheckedIn && reportText.trim() && !submittingReport
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-200 active:scale-95'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
              }`}
            >
              {submittingReport
                ? 'ກຳລັງສົ່ງ...'
                : dailyReport
                ? '💾 ບັນທຶກການແກ້ໄຂລາຍງານ'
                : '🚀 ສົ່ງບົດລາຍງານປະຈຳວັນ'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
