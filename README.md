# IHSG hari ini

Dashboard pasar saham Indonesia: IHSG per menit di atas jadwal sesi bursa, saham unggulan, pergerakan, dan halaman detail tiap saham (grafik candle, fundamental, bandar, arus asing).

- **Tampilan**: React 19 + Tailwind v4 dengan komponen dan tema [Dens-UI](https://github.com/dendense/dens-ui), di-host di GitHub Pages (`app/`).
- **Grafik**: deret waktu (IHSG per menit, candle saham) memakai chart Dens-UI terbaru di atas [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/) (Apache-2.0; logo atribusi dibiarkan tampil sesuai lisensinya).
- **Data**: Cloudflare Worker + D1 + cron per menit (`worker/`), diadaptasi dari `web/` di [fzn0x/idx](https://github.com/fzn0x/idx) (MIT, lihat `LICENSE.idx`). Sumber: Yahoo Finance, MSN Money, IPOT, register KSEI.

```
ihsg/
├─ app/      Vite + React + Dens-UI → GitHub Pages (/ihsg/)
├─ worker/   Cloudflare Worker /api/* (JSON envelope sama dengan `idx -o json`)
└─ .github/workflows/
   ├─ pages.yml    build app → GitHub Pages
   └─ worker.yml   test Worker → deploy ke Cloudflare (jika secret ada)
```

GitHub Pages hanya menyajikan file statis, jadi API-nya tetap berjalan di Cloudflare. Dashboard memanggilnya lintas origin. Worker hanya memberi header CORS untuk origin di `ALLOWED_ORIGINS`.

## Jalankan lokal

```bash
cd worker && npm install && npm run migrate:local
npm run dev -- --port 8790 --test-scheduled
```

Isi snapshot papan harga sekali (cron lokal tidak jalan sendiri):

```bash
curl "http://localhost:8790/__scheduled?cron=*+*+*+*+*"
```

Di terminal lain:

```bash
cd app && npm install && npm run dev
```

Buka http://localhost:5173/ihsg/. Alamat API lokal diatur di `app/.env.development` (`VITE_API_BASE=http://localhost:8790`).

## Deploy

### 1. Worker (Cloudflare, paket gratis)

```bash
cd worker
npx wrangler login
npx wrangler d1 create ihsg
```

Salin `database_id` yang dicetak ke `worker/wrangler.toml`, lalu:

```bash
npm run migrate:remote && npm run deploy
```

Worker akan aktif di `https://ihsg-api.<subdomain>.workers.dev`. Cek dengan `/healthz` dan `/api/market`. Batas subrequest cron sudah dijaga di bawah 50 (batas paket gratis, lihat `src/budget.js`).

Opsional, deploy otomatis lewat GitHub Actions: tambahkan secret `CLOUDFLARE_API_TOKEN` (izin Workers Scripts + D1 Edit) dan `CLOUDFLARE_ACCOUNT_ID` di repo.

### 2. Dashboard (GitHub Pages)

1. Di repo `dendense/ihsg`: **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: buat `IHSG_API_BASE` = URL Worker dari langkah 1 (tanpa `/` di akhir).
3. Push ke `main`. Workflow `pages.yml` mem-build `app/` dan menerbitkannya di `https://dendense.github.io/ihsg/`.

Kalau nama repo atau domain berbeda, sesuaikan `base` di `app/vite.config.ts` (atau env `IHSG_BASE`) dan `ALLOWED_ORIGINS` di `worker/wrangler.toml`.

## Test

```bash
cd worker && npm test
cd app && npm run typecheck
```

`npm test` menjalankan test Worker hasil port dari idx plus test CORS. `npm run typecheck` memeriksa tipe di app.

## Catatan data

- Harga tertunda sesuai yang diterbitkan sumbernya. Ini bukan saran investasi.
- Ringkasan broker (bandar) dan arus asing dibaca dari IPOT. Kalau IPOT menolak atau sedang gangguan, panelnya menampilkan pesan error dengan tombol coba lagi.
- Data idx.co.id (arus asing dalam lembar saham, kalender) menolak permintaan dari Cloudflare Workers, jadi hanya tersedia lewat CLI `idx`.
