/* Bunyi notifikasi (tiga nada naik, ~900ms -- diperpanjang 2026-08-24,
   dua nada ~300ms sebelumnya dirasa owner kurang lama/kurang kedengaran)
   -- disintesis lewat Web Audio API, BUKAN file audio (tidak nambah
   aset biner ke repo, tidak ada isu lisensi, ukuran nol). Dipakai
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

    // A5 -> C#6 -> E6, tiga nada naik yang lembut & lebih terasa
    // durasinya, bukan bunyi datar/mengagetkan.
    nada(880, 0, 0.28, 0.15);
    nada(1108.73, 0.16, 0.32, 0.13);
    nada(1318.5, 0.34, 0.48, 0.11);

    setTimeout(() => ctx.close(), 1200);
  } catch {
    // Diblokir browser atau AudioContext tidak tersedia -- diamkan.
  }
}
