# Riset: scalping dan swing saham BEI

Skrip untuk menguji, secara historis, apakah aturan screener sederhana memberi keunggulan pada saham BEI: 36 saham tambang & energi, 48 saham perbankan, 150 saham terlikuid, dan seluruh semesta (point-in-time). **Ini riset, bukan rekomendasi atau saran investasi.** Hasil masa lalu tidak menjamin hasil berikutnya.

## Menjalankan

Butuh Node 18+ dan Worker `ihsg-api` (lokal dengan `wrangler dev`, atau yang sudah di-deploy).

Jalankan dari root repo (`ihsg/`).

```bash
# 1. ambil data: 2 tahun harian (lewat ihsg-api) + 60 hari bar 5 menit (Yahoo chart), 190 saham
node research/fetch.mjs
# 1b. untuk uji point-in-time: 2 tahun harian seluruh ~950 saham
node research/fetch-all-daily.mjs

# 2. studi (nama kelompok opsional: tambang_energi, perbankan, likuid_150)
node research/intraday-screener.mjs [kelompok]   # beli saat buka, jual di tutup sesi 1 / sesi 2 / TP 1%
node research/swing.mjs [kelompok]               # tahan 3 / 5 / 10 hari
node research/swing-pit.mjs                      # swing, semesta 150 terlikuid per hari (point-in-time)
node research/orb-backtest.mjs                   # breakout rentang pembukaan, bar 5 menit 1 bulan
node research/scalp-stats.mjs                    # likuiditas, ATR, biaya 1 tick per saham
node research/ma-cross.mjs                       # MA10 memotong MA20: daftar hari terakhir + ketepatan rumus Stockbit
```

Pengaturan lewat environment:

- `IHSG_API` alamat API, bawaan `http://localhost:8790/api`. Untuk Worker live: `IHSG_API=https://ihsg-api.denyfarras.workers.dev/api`. Kalau API tidak bisa dihubungi, atau kurang dari separuh saham berhasil diambil, skrip berhenti tanpa mengubah file data.
- `IHSG_DATA` lokasi file data, bawaan `research/data/data.json` (di-gitignore).

## Asumsi yang sama di semua studi

- Fee beli 0,15% dan jual 0,25% (termasuk pajak jual 0,1%). Sesuaikan dengan fee broker-mu.
- Hanya saham dengan nilai transaksi rata-rata 20 hari ≥ Rp 10 M.
- Harga dibulatkan ke fraksi harga (tick) BEI: <200: 1, 200–<500: 2, 500–<2.000: 5, 2.000–<5.000: 10, ≥5.000: 25.
- Aturan ditetapkan sebelum melihat hasil, dan data dibagi menjadi periode latih dan uji (`SPLIT = 2026-04-01`). Uji yang dibuat setelah melihat hasil ditandai **post-hoc**.
- Statistik utama dihitung **per hari sinyal**: semua transaksi di hari yang sama dirata-rata menjadi satu observasi, karena saham satu sektor bergerak bersama.

## Kelompok saham

- `tambang_energi`: 36 saham batu bara, logam, minyak & gas, gas, energi terbarukan.
- `perbankan`: 48 saham bank di semesta ihsg. Hanya 25 yang lolos filter likuiditas.
- `likuid_150`: 150 saham dengan nilai transaksi rata-rata 3 bulan terbesar per 27 Nov 2026 (`broad.json`). **Daftar ini dipilih dengan pengetahuan masa kini**, sehingga condong ke saham yang belakangan ramai. Lihat uji point-in-time di bawah.
- **Trending** didefinisikan per hari, hanya dengan data sampai hari itu: nilai transaksi 20 hari ≥ 2× rata-rata 120 hari. Aturan S7/S8 (swing) dan R8/R9 (day-trade) memakai definisi ini.

## Temuan (data hingga 26 Nov 2026)

### 1. Breakout rentang pembukaan (`orb-backtest.mjs`)

Beli saat menembus tertinggi 09.00–09.15 + 1 tick, sampai 11.30. 19 saham, 23 sesi, 189 transaksi.

| Varian | Win rate | Rata-rata setelah fee |
|---|---:|---:|
| TP 1% / SL 0,5% | 19,0% | −1,20% |
| TP 2% / SL 1% | 20,1% | −1,30% |
| TP 3% / SL 1,5% | 23,3% | −1,23% |
| Jual saat tutup | 34,9% | −0,59% |

Semua varian sudah rugi sebelum fee. SL ketat tidak cocok untuk saham harga rendah, karena 1 tick bisa 0,5–0,9%.

### 2. Screener beli saat buka, jual hari itu (`intraday-screener.mjs`)

Tujuh aturan (momentum, tren, gap up, breakout 20 hari, akumulasi volume, rebound oversold, gap down). Tidak ada yang positif setelah fee dan pengelompokan per hari. Pembanding "semua saham" rata-rata −1,3% s/d −1,5% per transaksi. Gap down dan rebound oversold sempat terlihat positif, tapi itu semu:

- **Open harian Yahoo tidak sama dengan harga pembukaan.** Pada 44% hari, open harian berbeda dari open bar 5 menit pertama, dengan median −0,32%. Untuk data 60 hari, studi memakai open bar 5 menit pertama. Untuk data 2 tahun, ada koreksi +0,32%.
- **Transaksinya bergerombol.** 171 transaksi gap down terjadi hanya di 28 hari. Dihitung per hari, rata-ratanya −0,39% dan hanya 10 dari 28 hari positif.

### 3. Swing 3–10 hari (`swing.mjs`)

Beli di penutupan hari setelah sinyal dan jual di penutupan N hari kemudian, dengan stop penutupan −7%. Harga penutupan Yahoo cocok dengan bar 5 menit (2118 dari 2123 hari).

| Aturan (tahan 5 hari) | Latih (Mei 2025–Mar 2026) | Uji (Apr–Nov 2026) |
|---|---:|---:|
| Semua saham (pembanding) | +1,10% | −1,30% |
| Pullback dalam tren | +0,83% | −2,81% |
| Oversold dalam tren (RSI2 ≤ 10, > MA100) | +1,34% | −1,95% |
| Breakout 20 hari + volume | +1,95% | −1,14% |
| Oversold dalam (RSI14 ≤ 25) | +0,60% | −0,39% |
| Momentum relatif | +1,22% | −2,01% |
| MA5 memotong MA20 | +2,42% | −2,00% |

Hasilnya mengikuti arah sektor: naik di periode latih, turun di periode uji. Dibanding pembanding di hari yang sama, tidak ada aturan yang unggul di kedua periode.

**Post-hoc, filter kondisi sektor:** hanya masuk ketika ≥ 50% dari 36 saham berada di atas MA50 masing-masing. Filter ini mengurangi transaksi saat sektor melemah (56 dari 161 hari uji) dan memperkecil rugi pembanding di periode uji dari −1,30% menjadi −0,66%, tapi hasilnya belum positif. Yang terbaik, breakout + volume dengan ambang 60%, menghasilkan +0,20% dari 29 hari, tidak signifikan.

### 4. Diperluas ke perbankan, saham terlikuid, dan trending

**Day-trade** (`intraday-screener.mjs`), dihitung per hari: semua aturan negatif di ketiga kelompok, termasuk R8/R9 trending. Pembanding "semua saham" −1,0% s/d −1,5% per hari, baik keluar di tutup sesi 1, tutup sesi 2, maupun TP 1%.

**Swing tahan 5 hari** (`swing.mjs`, per hari, setelah fee):

| Kelompok | Pembanding latih / uji | Catatan |
|---|---|---|
| Tambang & energi | +0,79% / −1,30% | Trending (S7) unggul +1,16% di latih tapi kalah −2,20% di uji |
| Perbankan | −0,74% / −1,25% | Turun di kedua periode. Tidak ada aturan yang unggul konsisten |
| 150 terlikuid (daftar masa kini) | +0,66% / −0,98% | Breakout + volume (S3) unggul +2,01% (t=3,7) / +1,97% (t=2,4). **Ternyata bias, lihat di bawah** |

**Uji point-in-time** (`swing-pit.mjs`): setiap hari, semesta = 150 saham dengan nilai transaksi 60 hari terbesar **pada hari itu**, dari ~911 saham.

| Aturan (selisih vs pembanding) | Latih | Uji | Uji, tanpa tumpang tindih |
|---|---:|---:|---:|
| S3 breakout + volume | +1,71% (t=3,5) | +0,21% (t=0,4) | 0,00% |
| S5 momentum relatif | +1,45% (t=5,4) | −0,35% | −0,39% |
| S7 trending | +0,47% | −0,53% | −0,51% |
| S8 trending + naik | +0,90% | −0,42% | +0,23% (t=0,2) |

Keunggulan S3 di daftar "150 terlikuid masa kini" hilang ketika semestanya point-in-time. Saham yang sekarang ramai sering kali justru yang baru saja breakout, jadi memilihnya berdasarkan likuiditas masa kini sama dengan mengintip hasil. Aturan momentum dan trending hanya unggul di periode latih, saat pasar sedang naik.

### 5. MA10 memotong ke atas MA20 (`swing.mjs` S9/S10, `ma-cross.mjs`)

Screener Stockbit hanya membandingkan nilai hari ini, tanpa MA kemarin. Karena itu cross didekati dengan snapshot: `Price MA 10 > Price MA 20`, `Price MA 10 ≤ 1.02 × Price MA 20`, `Price > Price MA 10`.

- Ketepatan snapshot (2 tahun, saham likuid): 21% baru cross hari itu, 44% dalam 3 hari, 53% dalam 5 hari. 74% dari cross yang sebenarnya tertangkap di harinya.
- Swing tahan 5 hari, semesta point-in-time, selisih vs pembanding: cross tepat (S9) +0,33% latih / −0,42% uji, snapshot Stockbit (S10) +0,24% / −0,21%. Tanpa tumpang tindih, S9 −2,52% di uji (t=−2,5). Tidak ada keunggulan.

## Batasan

- Sumber harga Yahoo Finance: tertunda, open harian tidak akurat, bar bisa hilang.
- Bar 5 menit hanya tersedia sekitar 60 hari, yang kebetulan masa turun untuk sektor ini.
- Tidak ada data orderbook, antrean, maupun broker summary. Sumber broker summary dan arus asing (IPOT) sudah dihentikan.
- 36 saham dari satu sektor saling berkorelasi, jadi jumlah sampel efektifnya lebih kecil dari jumlah transaksi.
