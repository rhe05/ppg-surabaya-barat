'use client';

import JamaahChrome from '@/components/jamaah/JamaahChrome';
import KehadiranAcaraList from '@/components/jamaah/KehadiranAcaraList';

export default function KehadiranPage() {
  return (
    <main className="min-h-screen bg-bg">
      <JamaahChrome />
      <KehadiranAcaraList />
    </main>
  );
}
