# Riset: scalping dan swing saham tambang & energi

Skrip untuk menguji, secara historis, apakah aturan screener sederhana memberi keunggulan pada 36 saham tambang dan energi di BEI. **Ini riset, bukan rekomendasi atau saran investasi.** Hasil masa lalu tidak menjamin hasil berikutnya.

## Menjalankan

Butuh Node 18+ dan Worker `ihsg-api` (lokal dengan `wrangler dev`, atau yang sudah di-deploy).

```bash
# 1. ambil data: 2 tahun harian (lewat ihsg-api) + 60 hari bar 5 menit (Yahoo chart)
node research/fetch.mjs

# 2. studi
node research/intraday-screener.mjs   # beli saat buka, jual di tutup sesi 1 / sesi 2 / TP
node research/swing.mjs               # tahan 3 / 5 / 10 hari
node research/orb-backtest.mjs        # breakout rentang pembukaan, bar 5 menit 1 bulan
node research/scalp-stats.mjs         # likuiditas, ATR, biaya 1 tick per saham
```

Pengaturan lewat environment:

- `IHSG_API` alamat API, bawaan `http://localhost:8790/api`. Untuk Worker live: `IHSG_API=https://ihsg-api.denyfarras.workers.dev/api`.
- `IHSG_DATA` lokasi file data, bawaan `research/data/data.json` (di-gitignore).

## Asumsi yang sama di semua studi

- Fee beli 0,15% dan jual 0,25% (termasuk pajak jual 0,1%). Sesuaikan dengan fee broker-mu.
- Hanya saham dengan nilai transaksi rata-rata 20 hari ≥ Rp 10 M.
- Harga dibulatkan ke fraksi harga (tick) BEI: <200: 1, 200–<500: 2, 500–<2.000: 5, 2.000–<5.000: 10, ≥5.000: 25.
- Aturan ditetapkan sebelum melihat hasil, dan data dibagi menjadi periode latih dan uji (`SPLIT = 2026-04-01`). Uji yang dibuat setelah melihat hasil ditandai **post-hoc**.
- Statistik utama dihitung **per hari sinyal**: semua transaksi di hari yang sama dirata-rata menjadi satu observasi, karena saham satu sektor bergerak bersama.

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

## Batasan

- Sumber harga Yahoo Finance: tertunda, open harian tidak akurat, bar bisa hilang.
- Bar 5 menit hanya tersedia sekitar 60 hari, yang kebetulan masa turun untuk sektor ini.
- Tidak ada data orderbook, antrean, maupun broker summary. Sumber broker summary dan arus asing (IPOT) sudah dihentikan.
- 36 saham dari satu sektor saling berkorelasi, jadi jumlah sampel efektifnya lebih kecil dari jumlah transaksi.
