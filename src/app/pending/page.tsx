'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { UserProfile } from '@/types';

export default function PendingPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let unsubscribeDoc: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace('/login');
        return;
      }

      // Listen to user document in real time
      const userRef = doc(db, 'users', user.uid);
      unsubscribeDoc = onSnapshot(userRef, (snap) => {
        if (snap.exists()) {
          const data = { uid: snap.id, ...snap.data() } as UserProfile;
          setProfile(data);

          // If approved, refresh token to pick up new custom claims, then redirect
          if (data.role === 'intern' && data.status === 'approved') {
            user.getIdToken(true).then(() => {
              router.replace('/dashboard');
            }).catch(() => {
              router.replace('/dashboard');
            });
          } else if (data.role === 'admin' || data.role === 'superadmin') {
            user.getIdToken(true).then(() => {
              router.replace('/admin');
            }).catch(() => {
              router.replace('/admin');
            });
          }
        }
        setLoading(false);
      }, (err) => {
        console.error('Error listening to user status:', err);
        setLoading(false);
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, [router]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 font-lao">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 text-sm">ກຳລັງໂຫຼດຂໍ້ມູນສະຖານະບັນຊີ...</p>
        </div>
      </div>
    );
  }

  const status = profile?.status || 'pending';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-red-50/20 to-gray-100 flex items-center justify-center p-4 font-lao">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-gray-100 p-8 text-center relative overflow-hidden">
        {/* Decorative Top Accent */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-red-500 via-rose-500 to-red-600" />

        {/* LTC Logo */}
        <div className="mb-6 flex justify-center">
          <img
            src="https://ltc.laotel.com/BBLogo/LTC%20logo%20sign.png"
            alt="Lao Telecom Logo"
            className="h-16 w-auto object-contain"
          />
        </div>

        {/* Status Icon & Title */}
        {status === 'pending' && (
          <div className="space-y-4">
            <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-4xl shadow-inner border border-amber-200 animate-pulse">
              ⏳
            </div>
            <h1 className="text-2xl font-black text-gray-800">
              ລໍຖ້າການອະນຸມັດບັນຊີ
            </h1>
            <p className="text-gray-600 text-sm leading-relaxed max-w-md mx-auto">
              ບັນຊີຂອງທ່ານໄດ້ລົງທະບຽນສຳເລັດແລ້ວ ແລະ ກຳລັງລໍຖ້າໃຫ້ <span className="font-semibold text-red-600">Super Admin / ຝ່າຍບຸກຄະລາກອນ ລາວ ໂທລະຄົມ</span> ກວດສອບ ແລະ ກຳນົດພະແນກຝຶກງານໃຫ້.
            </p>
          </div>
        )}

        {status === 'rejected' && (
          <div className="space-y-4">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto text-4xl shadow-inner border border-red-200">
              ❌
            </div>
            <h1 className="text-2xl font-black text-red-700">
              ຄຳຂໍບໍ່ໄດ້ຮັບການອະນຸມັດ
            </h1>
            <p className="text-gray-600 text-sm leading-relaxed max-w-md mx-auto">
              ຂໍອະໄພ, ຄຳຂໍເຂົ້າຝຶກງານຂອງທ່ານບໍ່ຜ່ານການອະນຸມັດໃນຮອບນີ້. ກະລຸນາຕິດຕໍ່ຝ່າຍບຸກຄະລາກອນ ບໍລິສັດ ລາວ ໂທລະຄົມມະນາຄົມ ມະຫາຊົນ ສຳລັບຂໍ້ມູນເພີ່ມເຕີມ.
            </p>
          </div>
        )}

        {status === 'suspended' && (
          <div className="space-y-4">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-4xl shadow-inner border border-gray-300">
              🔒
            </div>
            <h1 className="text-2xl font-black text-gray-800">
              ບັນຊີຖືກລະງັບການໃຊ້ງານຊົ່ວຄາວ
            </h1>
            <p className="text-gray-600 text-sm leading-relaxed max-w-md mx-auto">
              ບັນຊີຝຶກງານຂອງທ່ານຖືກລະງັບການໃຊ້ງານຊົ່ວຄາວ. ທ່ານຈະບໍ່ສາມາດລົງເວລາ ຫຼື ສົ່ງບົດລາຍງານໄດ້ຈົນກວ່າຈະໄດ້ຮັບການເປີດໃຊ້ຄືນ.
            </p>
          </div>
        )}

        {/* User Card Summary */}
        {profile && (
          <div className="my-6 p-4 bg-gray-50 rounded-2xl border border-gray-200 text-left space-y-2 text-xs text-gray-600">
            <div className="flex justify-between">
              <span className="font-semibold text-gray-500">ຊື່ ແລະ ນາມສະກຸນ:</span>
              <span className="font-bold text-gray-800">{profile.fullname}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-gray-500">ອີເມວ:</span>
              <span className="text-gray-800">{profile.email}</span>
            </div>
            {profile.college && (
              <div className="flex justify-between">
                <span className="font-semibold text-gray-500">ມະຫາວິທະຍາໄລ:</span>
                <span className="text-gray-800">{profile.college}</span>
              </div>
            )}
            {profile.major && (
              <div className="flex justify-between">
                <span className="font-semibold text-gray-500">ສາຂາວິຊາ:</span>
                <span className="text-gray-800">{profile.major}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <span className="font-semibold text-gray-500">ສະຖານະປັດຈຸບັນ:</span>
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  status === 'pending'
                    ? 'bg-amber-100 text-amber-800'
                    : status === 'rejected'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-200 text-gray-800'
                }`}
              >
                {status.toUpperCase()}
              </span>
            </div>
          </div>
        )}

        {/* Realtime Note */}
        <p className="text-xs text-gray-400 mb-6 italic">
          ໜ້ານີ້ຈະປ່ຽນໄປໜ້າຫຼັກອັດຕະໂນມັດທັນທີເມື່ອ Super Admin ອະນຸມັດບັນຊີຂອງທ່ານ.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-bold hover:bg-gray-100 transition-all text-sm"
          >
            🔄 ກວດສອບສະຖານະໃໝ່
          </button>
          <button
            onClick={handleLogout}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-all shadow-md shadow-red-200 text-sm"
          >
            ອອກຈາກລະບົບ
          </button>
        </div>
      </div>
    </div>
  );
}
