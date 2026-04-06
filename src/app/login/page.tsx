'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const router = useRouter();

  // Auto-redirect if already logged in
  React.useEffect(() => {
    let isMounted = true;
    const timeout = setTimeout(() => {
      if (isMounted) setCheckingSession(false);
    }, 3000);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDocs(query(
            collection(db, 'users'), 
            where('email', '==', user.email), 
            limit(1)
          ));
          
          if (!userDoc.empty) {
            const role = userDoc.docs[0].data().role;
            if (role === 'admin') {
              router.replace('/admin/interns');
            } else {
              router.replace('/dashboard');
            }
          } else {
            router.replace('/dashboard');
          }
        } catch (err) {
          console.error(err);
          if (isMounted) setCheckingSession(false);
        }
      } else {
        if (isMounted) setCheckingSession(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Check role immediately after login
      const userDoc = await getDocs(query(
        collection(db, 'users'), 
        where('email', '==', user.email), 
        limit(1)
      ));

      if (!userDoc.empty) {
        const role = userDoc.docs[0].data().role;
        if (role === 'admin') {
          router.replace('/admin/interns');
        } else {
          router.replace('/dashboard');
        }
      } else {
        router.replace('/dashboard');
      }
    } catch (err: any) {
      setError('ອີເມວ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 font-lao">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 font-bold">ກຳລັງກວດສອບລະບົບ...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen flex items-center justify-center p-4">
      <main className="w-full max-w-md">
        <section className="bg-white rounded-[2.5rem] border border-gray-100 card-shadow overflow-hidden p-8 md:p-12 text-center">
          
          <div className="mb-8 flex flex-col items-center">
            <img 
              src="https://ltc.laotel.com/BBLogo/LTC%20logo%20sign.png" 
              alt="LTC Logo" 
              className="h-28 w-auto object-contain logo-style transition-transform hover:scale-105 duration-300"
            />
          </div>

          <header className="mb-8">
            <h1 className="text-2xl font-bold text-[#1a2b4b] mb-2">Intern Login</h1>
            <p className="text-sm text-gray-500">ກະລຸນາເຂົ້າສູ່ລະບົບເພື່ອດຳເນີນການຕໍ່</p>
          </header>

          <form onSubmit={handleLogin} className="space-y-5 text-left">
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-gray-700 ml-1" htmlFor="email">Email Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                  </svg>
                </span>
                <input 
                  className="block w-full pl-12 pr-4 py-3.5 border-gray-100 bg-gray-50 rounded-2xl focus:ring-red-500 focus:border-red-500 text-sm transition-all outline-none" 
                  id="email" 
                  placeholder="Enter your email" 
                  required 
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-gray-700 ml-1" htmlFor="password">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                  </svg>
                </span>
                <input 
                  className="block w-full pl-12 pr-12 py-3.5 border-gray-100 bg-gray-50 rounded-2xl focus:ring-red-500 focus:border-red-500 text-sm transition-all outline-none" 
                  id="password" 
                  placeholder="••••••" 
                  required 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-xs mt-2 text-center">{error}</p>}

            <div className="pt-4">
              <button 
                className="w-full py-4 px-4 btn-gradient-red text-white font-bold rounded-2xl shadow-lg shadow-red-100 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70" 
                type="submit"
                disabled={loading}
              >
                {loading ? 'ກຳລັງເຂົ້າສູ່ລະບົບ...' : '🚀 ເຂົ້າສູ່ລະບົບ'}
              </button>
            </div>

            <div className="relative flex items-center py-4">
              <div className="flex-grow border-t border-gray-100"></div>
              <span className="flex-shrink mx-4 text-gray-400 text-xs font-bold uppercase tracking-widest">ຫຼື</span>
              <div className="flex-grow border-t border-gray-100"></div>
            </div>

            <Link 
              href="/register" 
              className="w-full py-4 px-4 bg-white border-2 border-gray-50 text-red-600 font-bold rounded-2xl hover:bg-red-50 transition-all flex items-center justify-center gap-2"
            >
              <span>📝 ລົງທະບຽນໃໝ່</span>
            </Link>
          </form>

          <footer className="mt-10 pt-6 border-t border-gray-50 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
              © 2026 LTC Intern Tracking System
            </p>
          </footer>
        </section>
      </main>
    </div>
  );
};

export default LoginPage;
