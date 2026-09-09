'use client';

import { useParams } from 'next/navigation';
import JamaahChrome from '@/components/jamaah/JamaahChrome';
import InputKehadiran from '@/components/jamaah/InputKehadiran';

export default function InputKehadiranPage() {
  const params = useParams<{ acaraId: string }>();
  const id = Number(params?.acaraId);

  return (
    <main className="min-h-screen bg-bg">
      <JamaahChrome />
      {Number.isFinite(id) && id > 0 ? (
        <InputKehadiran acaraId={id} />
      ) : (
        <p className="px-[18px] pt-10 text-center text-[13px] text-text-dim">Acara tidak valid.</p>
      )}
    </main>
  );
}
