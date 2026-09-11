import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/* Dipanggil Vercel Cron (lihat vercel.json) sekali sehari. Membersihkan
   data yang disentuh pengunjung >30 hari lalu: baris baru dihapus, baris
   seed yang diedit dikembalikan ke snapshot semula (RPC
   reset_data_pengunjung_kadaluwarsa, migrasi 20260911150000).

   Vercel otomatis mengirim header Authorization: Bearer $CRON_SECRET pada
   pemicu cron -- dicocokkan di sini agar endpoint tak bisa dipicu orang lain. */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );

  const { data, error } = await supabase.rpc('reset_data_pengunjung_kadaluwarsa');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, hasil: data });
}
