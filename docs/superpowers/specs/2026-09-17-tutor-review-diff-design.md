# Tutor Review Card — Neon BranchDiff-style Status Design

Date: 2026-09-17. Scope: `apps/web/src/components/admin/tutor-review-card.tsx` only.

## Goal

Admin jelas bedakan per bagian kartu review: mana field **berubah** (current → proposed),
mana **terisi**, mana **kosong/belum diisi**. Ikuti pola Neon `BranchDiff`: header berisi
arah + total count, filter jenis + search, baris expandable before/after. Tanpa install
Neon UI; murni komposisi komponen Selia (aturan AGENTS.md).

## Pendekatan dipertimbangkan

1. **Selia-native (dipilih).** Header count + Chip filter + baris expandable + Badge jenis.
   Pro: tanpa dep baru, token OKLCH konsisten, ikut pola `CardInfoPreview`/`EmptyState` yang ada.
   Kontra: tanpa word-level tint ala Neon (dihemat, tak perlu untuk review profil).
2. Install Neon `BranchDiff` via shadcn. Ditolak: langgar aturan Selia-only, token/tema beda,
   dependensi berat untuk satu kartu.
3. Minimal: tambah kolom status di tabel proposed saja. Ditolak: tak jawab "kosong vs belum"
   di seksi lain (pilihan user: seluruh kartu).

## Desain

### 1. Model status field

Sumber: `profile.*` (current) + `profile.pendingProfileChanges` (proposed). Tiap field/section
dapat satu status:

- `added` (+): current kosong → proposed terisi.
- `modified` (~): dua-dua terisi, nilai beda.
- `removed` (−): current terisi → proposed kosong.
- `filled` (tanpa badge, atau Badge `secondary` "Filled"): terisi, tak ada usulan.
- `empty` (Badge `secondary`/`tertiary` "Empty" + EmptyState inline): dua-dua kosong.

"Berubah" = key ada di `pendingProfileChanges` (kecuali `profileImageUrl`, ditangani panel foto).
"Kosong" = nilai current falsy/array kosong setelah normalisasi (trim string, `[]` → kosong).

### 2. Header ringkasan + filter

Di atas `Proposed profile changes`, tambah baris ringkasan ala Neon:

- `Profil tutor → review` + count `+N ~N −N ○N` (added/modified/removed/empty).
- Search `Input` filter nama field + `Chip` filter: all/added/modified/removed/empty.
  Search + filter komposabel, berlaku ke daftar diff dan badge seksi.

### 3. Baris diff expandable

Ganti tabel 3-kolom statis dengan daftar baris (komposisi `Item`: `ItemMedia` simbol jenis,
`ItemContent` label field + ringkasan before → after, `ItemAction` chevron):

- Baris = `<button aria-expanded>`; tutup tampil ringkasan, buka tampil Current vs Proposed
  berdampingan (reuse render `PendingChangePair` yang ada).
- Jenis dibawa teks + simbol (`+`/`~`/`−`/`○`), bukan warna saja (a11y ikut pola Neon).
- Foto profil tetap panel berdampingan current/proposed (sudah jelas), dapat Badge Pending
  bila ada usulan (sudah ada).

### 4. Badge status seksi

Tiap `ReviewSection` (Profile, Teaching setup, Credentials, Proofs, Marks, Photo, Payout)
dapat Badge di judul: `~ Changes` bila ada field berubah di dalamnya, `Empty` bila seluruh
isi kosong, tanpa badge bila terisi penuh. Definisi "isi seksi" ikut variabel yang sudah ada
(`hasEducation/hasAchievements/hasExperiences`, `proofRows`, `priceEntries`, `payoutRows`,
`specializationItems`, `shortBio`, foto).

### 5. Komponen Selia dipakai

`Card`, `Badge`, `Chip` (filter), `Input` + `InputGroup` (search), `Item` series (baris),
`EmptyState` (seksi kosong), `Text`, `Stack`. Tanpa komponen/tab baru. Override satu-kali
pakai `!` bila perlu; perbaikan global masuk sumber komponen bila pola berulang.

### 6. Aksesibilitas + perilaku

- Baris diff tombol asli (`aria-expanded`/`aria-controls`); simbol + label teks selalu bareng.
- Filter Chip keyboard-focusable; count header umumkan via `aria-live`/`sr-only` ringkasan.
- Motion hemat; hormati reduced-motion (tanpa animasi kustom).

### 7. Testing

- Unit: fungsi pemeta status (added/modified/removed/filled/empty) + filter/search pure.
- Manual RUNBOOK: buka profil pending_review berisi campuran ubah/kosong/terisi; cek count,
  filter tiap jenis, expand/collapse, badge seksi, viewport sempit tanpa overflow horizontal.

## Catatan implementasi

- Bangun di atas edit worktree header yang ada (tata CardHeader/Avatar/email); sertakan
  penghapusan import tak terpakai (`IconMail`, `CardHeaderAction`) sehingga gate lint
  pre-push bersih.
- Tanpa perubahan RPC/skema. `pendingProfileChanges` tetap sumber kebenaran usulan.
- File 1514 baris dan tumbuh: ekstraksi helper diff ke modul pendamping
  (`tutor-review-diff.ts`) bila logika status + filter melebihi ~150 baris, agar file kartu
  tetap fokus render.
