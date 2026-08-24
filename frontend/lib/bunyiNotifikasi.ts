/* Bunyi notifikasi singkat (dua nada naik, ~300ms, mirip chime Slack) --
   disintesis lewat Web Audio API, BUKAN file audio (tidak nambah aset
   biner ke repo, tidak ada isu lisensi, ukuran nol). Dipakai
   BellPermintaanGuru.tsx begitu ada sesuatu BARU yang perlu diperhatikan
   (Perlu Tindakan/Permintaan belum dibaca).

   Browser bisa memblokir audio tanpa gesture pengguna (autoplay policy)
   -- gagal diam2 lewat try/catch, JANGAN sampai lempar error yang
   mengganggu lonceng cuma krn suaranya tidak bisa main. */
export function mainkanBunyiNotifikasi() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const mulai = ctx.currentTime;

    function nada(freq: number, jeda: number, durasi: number, volume: number) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, mulai + jeda);
      gain.gain.linearRampToValueAtTime(volume, mulai + jeda + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, mulai + jeda + durasi);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(mulai + jeda);
      osc.stop(mulai + jeda + durasi + 0.02);
    }

    // A5 -> E6, interval naik yang lembut, bukan bunyi datar/mengagetkan.
    nada(880, 0, 0.12, 0.15);
    nada(1318.5, 0.09, 0.18, 0.12);

    setTimeout(() => ctx.close(), 500);
  } catch {
    // Diblokir browser atau AudioContext tidak tersedia -- diamkan.
  }
}
