'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

const RegisterPage = () => {
  const [formData, setFormData] = useState({
    fullname: '',
    phone: '',
    email: '',
    college: '',
    major: '',
    startDate: '',
    endDate: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('ລະຫັດຜ່ານບໍ່ກົງກັນ');
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      // Save additional info to Firestore
      // NOTE: For the first user or special setup, you can change 'role' to 'admin' manually in Firebase Console.
      // Or you can use a secret code here for initial setup.
      const isInitialAdmin = formData.email === 'admin@ltc.lao'; // Example secret admin email
      
      await setDoc(doc(db, 'users', user.uid), {
        fullname: formData.fullname,
        college: formData.college,
        major: formData.major,
        phone: formData.phone,
        email: formData.email,
        startDate: formData.startDate,
        endDate: formData.endDate,
        role: isInitialAdmin ? 'admin' : 'intern',
        createdAt: new Date().toISOString(),
      });

      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      setError('ການລົງທະບຽນຜິດພາດ: ' + (err.message || 'ລອງໃໝ່ອີກຄັ້ງ'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#f1f5f9] font-lao">
      <main className="w-full max-w-5xl bg-white rounded-[2rem] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-gray-100">
        
        <section className="hidden md:flex md:w-5/12 bg-[#e11d48] items-center justify-center p-12 relative overflow-hidden">
          <div className="z-10 text-white text-center">
            <div className="mb-6">
              <img src="https://ltc.laotel.com/BBLogo/LTC%20logo%20sign.png" className="h-20 mx-auto brightness-200" alt="Logo" />
            </div>
            <h1 className="text-3xl font-bold mb-4">ຍິນດີຕ້ອນຮັບ</h1>
            <p className="text-sm opacity-80 leading-relaxed">
              ລະບົບຕິດຕາມ ແລະ ປະເມີນຜົນນັກສຶກສາຝຶກງານ <br /> ບໍລິສັດ ລາວ ໂທລະຄົມມະນາຄົມ ມະຫາຊົນ
            </p>
          </div>
          <div className="absolute -top-20 -left-20 w-64 h-64 bg-white/10 rounded-full"></div>
          <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-black/5 rounded-full"></div>
        </section>

        <section className="w-full md:w-7/12 p-8 md:p-12 bg-white">
          <div className="text-center md:text-left mb-8">
            <h2 className="text-2xl font-black text-[#1a2b4b] uppercase">ສ້າງບັນຊີໃໝ່</h2>
            <p className="text-gray-400 text-sm mt-1">ປ້ອນຂໍ້ມູນຂອງທ່ານໃຫ້ຄົບຖ້ວນເພື່ອລົງທະບຽນ</p>
          </div>

          <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-bold text-gray-700 ml-1">ຊື່ ແລະ ນາມສະກຸນ</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeWidth="2"/></svg>
                </div>
                <input 
                  type="text" 
                  name="fullname" 
                  required
                  value={formData.fullname}
                  onChange={handleChange}
                  className="pl-12 w-full rounded-xl border-gray-200 bg-gray-50 focus:ring-[#e11d48] focus:border-[#e11d48] py-3 transition-all outline-none" 
                  placeholder="ຊື່ ແລະ ນາມສະກຸນ" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-gray-700 ml-1">ເບີໂທລະສັບ</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" strokeWidth="2"/></svg>
                </div>
                <input 
                  type="tel" 
                  name="phone" 
                  required
                  value={formData.phone}
                  onChange={handleChange}
                  className="pl-12 w-full rounded-xl border-gray-200 bg-gray-50 focus:ring-[#e11d48] focus:border-[#e11d48] py-3 transition-all outline-none" 
                  placeholder="20 XXXX XXXX" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-gray-700 ml-1">ສະຖາບັນການສຶກສາ (College)</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" strokeWidth="2"/></svg>
                </div>
                <input 
                  type="text" 
                  name="college" 
                  required
                  value={formData.college}
                  onChange={handleChange}
                  className="pl-12 w-full rounded-xl border-gray-200 bg-gray-50 focus:ring-[#e11d48] focus:border-[#e11d48] py-3 transition-all outline-none" 
                  placeholder="ຊື່ວິທະຍາໄລ / ມະຫາວິທະຍາໄລ" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-gray-700 ml-1">ພາກວິຊາ (Major)</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" strokeWidth="2"/></svg>
                </div>
                <input 
                  type="text" 
                  name="major" 
                  required
                  value={formData.major}
                  onChange={handleChange}
                  className="pl-12 w-full rounded-xl border-gray-200 bg-gray-50 focus:ring-[#e11d48] focus:border-[#e11d48] py-3 transition-all outline-none" 
                  placeholder="ສາຂາວິຊາທີ່ຮຽນ" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-gray-700 ml-1">ອີເມວ</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeWidth="2"/></svg>
                </div>
                <input 
                  type="email" 
                  name="email" 
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="pl-12 w-full rounded-xl border-gray-200 bg-gray-50 focus:ring-[#e11d48] focus:border-[#e11d48] py-3 transition-all outline-none" 
                  placeholder="example@gmail.com" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-gray-700 ml-1">ວັນທີເລີ່ມຝຶກງານ</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeWidth="2"/></svg>
                </div>
                <input 
                  type="date" 
                  name="startDate" 
                  required
                  value={formData.startDate}
                  onChange={handleChange}
                  className="pl-12 w-full rounded-xl border-gray-200 bg-gray-50 focus:ring-[#e11d48] focus:border-[#e11d48] py-3 transition-all outline-none" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-gray-700 ml-1">ວັນທີສິ້ນສຸດການຝຶກ</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" strokeWidth="2"/></svg>
                </div>
                <input 
                  type="date" 
                  name="endDate" 
                  required
                  value={formData.endDate}
                  onChange={handleChange}
                  className="pl-12 w-full rounded-xl border-gray-200 bg-gray-50 focus:ring-[#e11d48] focus:border-[#e11d48] py-3 transition-all outline-none" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-gray-700 ml-1">ລະຫັດຜ່ານ</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeWidth="2"/></svg>
                </div>
                <input 
                  type="password" 
                  name="password" 
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="pl-12 w-full rounded-xl border-gray-200 bg-gray-50 focus:ring-[#e11d48] focus:border-[#e11d48] py-3 transition-all outline-none" 
                  placeholder="••••••••" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-gray-700 ml-1">ຢືນຢັນລະຫັດຜ່ານ</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                   <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeWidth="2"/></svg>
                </div>
                <input 
                  type="password" 
                  name="confirmPassword" 
                  required
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="pl-12 w-full rounded-xl border-gray-200 bg-gray-50 focus:ring-[#e11d48] focus:border-[#e11d48] py-3 transition-all outline-none" 
                  placeholder="••••••••" 
                />
              </div>
            </div>

            {error && <p className="md:col-span-2 text-red-500 text-xs text-center mt-2">{error}</p>}

            <div className="md:col-span-2 pt-4">
              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-[#e11d48] hover:bg-rose-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-rose-100 transition-all active:scale-[0.98] disabled:opacity-70"
              >
                {loading ? 'ກຳລັງລົງທະບຽນ...' : 'ລົງທະບຽນເຂົ້າໃຊ້ລະບົບ'}
              </button>
              <p className="text-center text-sm text-gray-500 mt-6">
                ມີບັນຊີແລ້ວບໍ? <Link href="/login" className="text-[#e11d48] font-bold hover:underline">ເຂົ້າສູ່ລະບົບ</Link>
              </p>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
};

export default RegisterPage;
