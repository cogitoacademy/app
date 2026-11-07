import { z } from "zod";

export const FAQ_CATEGORY_KEYS = [
  "about",
  "programs",
  "tutors",
  "accounts",
  "marks",
  "payments",
  "progress",
  "offline",
  "tutor-join",
] as const;

export type FaqCategoryKey = (typeof FAQ_CATEGORY_KEYS)[number];

export const DEFAULT_FAQ_CATEGORY: FaqCategoryKey = "about";

export const FAQ_CATEGORY_LABELS: Record<
  FaqCategoryKey,
  { en: string; id: string }
> = {
  about: { en: "About Cogito", id: "Tentang Cogito" },
  programs: { en: "Programs and classes", id: "Program dan kelas" },
  tutors: { en: "Tutors", id: "Tutor" },
  accounts: { en: "Accounts and booking", id: "Akun dan pemesanan" },
  marks: { en: "Marks and pricing", id: "Marks dan harga" },
  payments: {
    en: "Payments, cancellations and returns",
    id: "Pembayaran, pembatalan, dan pengembalian",
  },
  progress: { en: "Progress and results", id: "Perkembangan dan hasil" },
  offline: {
    en: "Offline classes, schools and contact",
    id: "Kelas offline, sekolah, dan kontak",
  },
  "tutor-join": {
    en: "For tutors who want to join",
    id: "Untuk tutor yang ingin bergabung",
  },
};

export const faqCategorySchema = z.enum(FAQ_CATEGORY_KEYS);
