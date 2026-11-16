'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function InternProfileRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get('id');

  useEffect(() => {
    if (id) {
      router.replace(`/admin/interns/${id}`);
    } else {
      router.replace('/admin/interns');
    }
  }, [id, router]);

  return (
    <div className="flex items-center justify-center h-screen bg-[#0b0e14] text-white font-lao">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        <p className="text-xs text-gray-500 font-mono">Redirecting to Intern Profile...</p>
      </div>
    </div>
  );
}
