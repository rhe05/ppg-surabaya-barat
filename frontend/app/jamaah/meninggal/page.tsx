'use client';

import JamaahChrome from '@/components/jamaah/JamaahChrome';
import JamaahMeninggalManager from '@/components/jamaah/JamaahMeninggalManager';

export default function JamaahMeninggalPage() {
  return (
    <main className="min-h-screen bg-bg">
      <JamaahChrome />
      <JamaahMeninggalManager />
    </main>
  );
}
