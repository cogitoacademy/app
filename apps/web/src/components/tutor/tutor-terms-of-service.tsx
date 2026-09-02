"use client";

import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@cogito-app/ui/components/selia/dialog";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Checkbox } from "@cogito-app/ui/components/selia/checkbox";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Text } from "@cogito-app/ui/components/selia/text";
import { IconShieldCheck } from "@tabler/icons-react";

import { TUTOR_TERMS_OF_SERVICE_VERSION } from "@cogito-app/api/modules/tutor/tutor.types";

type TutorTermsLanguage = {
  title: string;
  paragraphs: string[];
};

type TutorTermsClause = {
  number: number;
  indonesian: TutorTermsLanguage;
  english: TutorTermsLanguage;
};

const TUTOR_TERMS_CLAUSES: TutorTermsClause[] = [
  {
    number: 1,
    indonesian: {
      title: "Sifat Platform & Tanpa Jaminan Kuota",
      paragraphs: [
        "Cogito Academy bertindak secara eksklusif sebagai pasar digital (marketplace) yang memfasilitasi pertemuan antara Anda dan calon siswa bimbingan akademik serta persiapan kompetisi.",
        "Anda berkedudukan hukum sebagai mitra independen (independent contractor), bukan karyawan tetap, agen, atau perwakilan hukum Perusahaan.",
        "Cogito Academy memfasilitasi visibilitas profil dan sarana pemesanan, namun tidak memberikan jaminan volume minimum atas jumlah siswa, pemesanan sesi, atau proyeksi pendapatan tertentu.",
      ],
    },
    english: {
      title: "Nature of Platform & No Volume Guarantees",
      paragraphs: [
        "Cogito Academy operates exclusively as a digital marketplace platform connecting you with prospective students seeking academic coaching and competition training.",
        "You participate as an independent contractor, not as an employee, agent, or legal representative of the Company.",
        "While Cogito Academy facilitates profile visibility and booking tools, the Company provides no guarantees regarding minimum student volume, booking frequency, or earnings.",
      ],
    },
  },
  {
    number: 2,
    indonesian: {
      title: "Tarif Dasar, Biaya Layanan (Take Rate), & Pembayaran",
      paragraphs: [
        "Anda memegang hak penuh untuk menetapkan tarif dasar (base rate) per sesi pengajaran Anda.",
        "Cogito Academy menyediakan parameter tarif rekomendasi berdasarkan data pasar untuk membantu daya saing profil Anda, namun keputusan akhir tetap berada di tangan Anda.",
        "Biaya layanan platform (take rate) ditambahkan di atas (on top of) tarif dasar Anda untuk membentuk harga akhir yang dibayarkan siswa; Anda memahami bahwa tarif dasar yang lebih tinggi dapat memengaruhi rasio pemesanan siswa.",
        "Pembayaran bersih (net payout) sebesar tarif dasar penuh Anda akan dicairkan ke rekening bank resmi terdaftar Anda sesuai dengan siklus pencairan platform setelah sesi terverifikasi selesai.",
      ],
    },
    english: {
      title: "Base Pricing, Marketplace Fees (Take Rate), & Payouts",
      paragraphs: [
        "You retain full discretion to determine your own base rate per coaching session.",
        "Cogito Academy provides recommended pricing benchmarks based on market data to assist your profile competitiveness, though the final rate remains your choice.",
        "The platform service fee (take rate) is applied on top of your base rate to calculate the final price displayed to students; you acknowledge higher base rates may affect booking frequency.",
        "Your full base rate will be disbursed as a net payout to your registered, verified bank account according to the platform payout schedule upon verified session completion.",
      ],
    },
  },
  {
    number: 3,
    indonesian: {
      title: "Non-Sirkumvensi, Eksklusivitas Bidang, & Batasan Non-Kompetisi",
      paragraphs: [
        "Seluruh siswa yang diperkenalkan atau terhubung dengan Anda melalui platform Cogito Academy wajib dijadwalkan dan ditransaksikan secara eksklusif melalui platform Cogito Academy.",
        "Selama masa kemitraan aktif, apabila terdapat calon siswa dari jejaring luar yang meminta bimbingan dalam bidang persiapan kompetisi akademik (termasuk debat, MUN, atau kompetisi sejenis), Anda wajib mengarahkan transaksi tersebut melalui platform Cogito Academy.",
        "Selama kemitraan aktif dan hingga 12 (dua belas) bulan penuh setelah pengakhiran akun, Anda dilarang keras bertindak sebagai pendiri (founder), pendiri bersama (co-founder), pemilik saham substansial, eksekutif, atau konsultan utama pada entitas bisnis bimbingan belajar yang bersaing langsung dengan Cogito Academy di bidang persiapan kompetisi akademik.",
        "Anda hanya diperkenankan mengajar secara independen atau bergabung dengan institusi pendidikan lain dalam bidang bimbingan kompetisi akademik setelah lewatnya masa jeda 12 (dua belas) bulan sejak pengakhiran akun, dengan ketentuan mutlak tidak merekrut (solicit) siswa Cogito Academy dan tidak menggunakan kekayaan intelektual milik Perusahaan.",
      ],
    },
    english: {
      title:
        "Non-Circumvention, Scope Exclusivity, & Non-Competition Restrictions",
      paragraphs: [
        "All students introduced or connected to you through the Cogito Academy platform must be booked, scheduled, and billed exclusively via the platform.",
        "During active partnership, if prospective students from external networks request coaching in academic competition domains (including debate, MUN, or related academic competitions), you agree to route all such engagements exclusively through Cogito Academy.",
        "While active and for a mandatory buffer of 12 (twelve) months following account termination, you are strictly prohibited from acting as a founder, co-founder, material equity owner, operating executive, or principal consultant of any tutoring business directly competing with Cogito Academy's academic competition programs.",
        "You may engage in independent or institutional tutoring within the academic competition domain only after the expiration of a 12 (twelve) month buffer following account termination, subject to the absolute condition that you never solicit Cogito Academy students or exploit proprietary company assets.",
      ],
    },
  },
  {
    number: 4,
    indonesian: {
      title: "Integritas Saluran Komunikasi, Sanksi Finansial, & Ganti Rugi",
      paragraphs: [
        "Seluruh interaksi, koordinasi logistik, tautan kelas daring, dan evaluasi belajar wajib diselenggarakan melalui kanal komunikasi resmi Cogito Academy.",
        "Anda dilarang meminta, membagikan, atau bertukar kontak langsung (nomor telepon, akun WhatsApp pribadi, media sosial, atau rekening bank pribadi) dengan siswa atau wali siswa untuk tujuan transaksi di luar sistem (disintermediation).",
        "Pelanggaran terhadap klausul ini mengakibatkan penangguhan akun permanen, pembatalan/penahanan seluruh honorarium yang belum dicairkan (forfeiture of pending payouts), serta kewajiban pembayaran ganti rugi likuidasi (liquidated damages) kepada Perusahaan atas setiap siswa yang dialihkan ke luar platform.",
      ],
    },
    english: {
      title: "Channel Integrity, Financial Penalties, & Liquidated Damages",
      paragraphs: [
        "All interactions, scheduling logistics, session links, and learning feedback must be conducted through Cogito Academy's official communication channels.",
        "You are strictly barred from sharing, requesting, or exchanging direct personal contact details (phone numbers, personal WhatsApp, social handles, or personal bank accounts) with students or guardians to solicit off-platform transactions (disintermediation).",
        "Any breach of this clause shall result in immediate account termination, complete forfeiture of any accrued unpaid payouts, and contractual liability for liquidated damages owed to the Company for each student circumvented off-platform.",
      ],
    },
  },
  {
    number: 5,
    indonesian: {
      title: "Kerahasiaan & Hak Kekayaan Intelektual",
      paragraphs: [
        "Anda wajib menjaga kerahasiaan data pribadi siswa, materi kurikulum internal, kerangka kerja pelatihan, dan data operasional Cogito Academy.",
        "Segala silabus, materi latihan, bank soal, dan modul milik Perusahaan adalah kekayaan intelektual eksklusif PT Cogito Academy Indonesia dan dilindungi undang-undang hak cipta.",
        "Anda dilarang menduplikasi, mempublikasikan, menjual kembali, atau memanfaatkan aset intelektual Perusahaan di luar batasan sesi platform tanpa izin tertulis resmi.",
      ],
    },
    english: {
      title: "Confidentiality & Intellectual Property",
      paragraphs: [
        "You must preserve strict confidentiality regarding student personal data, internal curricula, training frameworks, and operational data of Cogito Academy.",
        "All syllabi, drills, question banks, and modules provided by the Company remain the exclusive intellectual property of PT Cogito Academy Indonesia, protected under copyright laws.",
        "You may not duplicate, publish, resell, or exploit Company intellectual assets outside authorized platform sessions without prior written authorization.",
      ],
    },
  },
  {
    number: 6,
    indonesian: {
      title: "Standar Perlindungan Anak & Keselamatan Siswa",
      paragraphs: [
        "Keselamatan fisik, mental, dan emosional siswa merupakan prioritas mutlak yang tidak dapat dikompromikan.",
        "Anda wajib memelihara lingkungan belajar yang aman, suportif, inklusif, dan menjunjung etika pengajaran profesional.",
        "Segala bentuk perundungan (bullying), pelecehan verbal maupun nonverbal, diskriminasi, atau tindakan tidak senonoh akan berakibat pada pemutusan kemitraan seketika, penutupan akun permanen, serta pelaporan langsung kepada pihak berwajib.",
      ],
    },
    english: {
      title: "Child Safeguarding & Student Well-Being",
      paragraphs: [
        "The physical, psychological, and emotional safety of students is an absolute, non-negotiable priority.",
        "You agree to foster a safe, supportive, inclusive environment reflecting the highest standards of professional pedagogical ethics.",
        "Any bullying, verbal or physical harassment, discrimination, or inappropriate conduct will trigger immediate partnership termination, permanent blacklisting, and referral to law enforcement.",
      ],
    },
  },
  {
    number: 7,
    indonesian: {
      title: "Kepatuhan Regulasi, Pajak, & Pembaruan Kebijakan",
      paragraphs: [
        "Anda bertanggung jawab penuh atas kepatuhan pelaporan kewajiban perpajakan pribadi Anda atas penghasilan yang diperoleh melalui platform.",
        "Anda wajib mematuhi seluruh perundang-undangan Republik Indonesia yang berlaku, termasuk UU Informasi dan Transaksi Elektronik (UU ITE) dan UU Perlindungan Data Pribadi (UU PDP).",
        "Cogito Academy berhak memperbarui ketentuan kemitraan, struktur biaya (take rate), maupun regulasi internal platform untuk kebutuhan penyesuaian hukum atau operasional; pemberitahuan tertulis akan disampaikan melalui dasbor akun atau surel Anda sebelum pembaruan berlaku efektif.",
      ],
    },
    english: {
      title: "Regulatory Compliance, Taxation, & Policy Updates",
      paragraphs: [
        "You remain solely responsible for your personal tax reporting and compliance arising from earnings generated on the platform.",
        "You agree to comply with all applicable Indonesian laws, including the Electronic Information and Transactions Law (UU ITE) and Personal Data Protection Law (UU PDP).",
        "Cogito Academy reserves the right to update these partnership terms, fee structures (take rates), or internal policies to meet legal or operational requirements; advance notification will be delivered via your dashboard or registered email prior to taking effect.",
      ],
    },
  },
  {
    number: 8,
    indonesian: {
      title: "Ganti Rugi & Pembatasan Tanggung Jawab",
      paragraphs: [
        "Anda setuju untuk membebaskan dan melindungi Cogito Academy, direksi, dan staf dari segala klaim, gugatan hukum, kerugian, atau biaya (termasuk biaya pengacara) yang timbul akibat kelalaian, pelanggaran syarat kemitraan, atau pelanggaran hukum yang Anda lakukan.",
        "Cogito Academy tidak bertanggung jawab atas kerugian tidak langsung, kehilangan keuntungan hipotetis, atau sengketa pribadi yang timbul di luar cakupan operasional platform.",
      ],
    },
    english: {
      title: "Indemnification & Limitation of Liability",
      paragraphs: [
        "You agree to indemnify, defend, and hold harmless Cogito Academy, its directors, and staff from any claims, legal actions, liabilities, or expenses (including legal fees) arising from your negligence, misconduct, or breach of these terms.",
        "Cogito Academy shall not be liable for any indirect damages, speculative loss of profits, or private disputes occurring beyond platform-mediated boundaries.",
      ],
    },
  },
  {
    number: 9,
    indonesian: {
      title: "Hukum yang Berlaku & Penyelesaian Sengketa",
      paragraphs: [
        "Syarat dan ketentuan ini ditafsirkan dan diatur berdasarkan hukum negara Republik Indonesia.",
        "Segala perselisihan atau sengketa yang timbul dari perjanjian ini wajib diselesaikan terlebih dahulu melalui musyawarah mufakat secara kekeluargaan dalam jangka waktu 30 (tiga puluh) hari kalender.",
        "Apabila mufakat tidak tercapai, sengketa akan diajukan dan diselesaikan secara eksklusif melalui yurisdiksi Pengadilan Negeri di wilayah domisili hukum PT Cogito Academy Indonesia.",
      ],
    },
    english: {
      title: "Governing Law & Dispute Resolution",
      paragraphs: [
        "These terms and conditions are governed by and construed in accordance with the laws of the Republic of Indonesia.",
        "Any disputes arising out of this agreement shall first be resolved through good-faith amicable negotiations within 30 (thirty) calendar days.",
        "If no settlement is reached, the dispute shall be submitted to the exclusive jurisdiction of the District Court holding authority over the registered legal domicile of PT Cogito Academy Indonesia.",
      ],
    },
  },
];

function TermsLanguageBlock({
  label,
  language,
}: {
  label: string;
  language: TutorTermsLanguage;
}) {
  return (
    <div>
      <Text className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </Text>
      <Heading size="sm" className="mt-1 text-base">
        {language.title}
      </Heading>
      <ol className="mt-2 list-[lower-alpha] space-y-2 pl-5 text-sm leading-relaxed text-muted">
        {language.paragraphs.map((paragraph) => (
          <li key={paragraph}>{paragraph}</li>
        ))}
      </ol>
    </div>
  );
}

export function TutorTermsOfService({
  open,
  accepted,
  readOnly = false,
  isSubmitting,
  onAcceptedChange,
  onAccept,
  onOpenChange,
}: {
  open: boolean;
  accepted: boolean;
  readOnly?: boolean;
  isSubmitting: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  onAccept: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-4xl!">
        <DialogHeader className="items-start flex-col">
          <IconBox variant="info-subtle" circle>
            <IconShieldCheck aria-hidden="true" />
          </IconBox>
          <div className="min-w-0">
            <DialogTitle className="text-base leading-snug sm:text-xl">
              <span className="block">
                SYARAT DAN KETENTUAN KEMITRAAN TUTOR COGITO ACADEMY
              </span>
              <span className="mt-1 block text-sm font-medium text-muted sm:text-base">
                COGITO ACADEMY TUTOR TERMS OF SERVICE
              </span>
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm">
              Terakhir Diperbarui: September 2026 · Last Updated: September 2026
              · Version {TUTOR_TERMS_OF_SERVICE_VERSION}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="min-h-0 flex-1">
          <Text className="text-sm text-muted">
            Bacalah seluruh syarat dalam Bahasa Indonesia dan English sebelum
            mengirim profil Anda untuk ditinjau. Read both language versions
            before submitting your profile for review.
          </Text>

          <div className="mt-5 grid gap-4">
            {TUTOR_TERMS_CLAUSES.map((clause) => (
              <section
                key={clause.number}
                className="rounded-lg border border-item-border bg-item p-4"
              >
                <Text className="text-sm font-semibold">
                  Klausul {clause.number} / Clause {clause.number}
                </Text>
                <div className="mt-3 grid gap-4">
                  <TermsLanguageBlock
                    label="Bahasa Indonesia"
                    language={clause.indonesian}
                  />
                  <div className="border-t border-item-border pt-4">
                    <TermsLanguageBlock
                      label="English"
                      language={clause.english}
                    />
                  </div>
                </div>
              </section>
            ))}
          </div>

          {readOnly ? (
            <div className="mt-5 rounded-lg border border-item-border bg-item p-4">
              <Text className="text-sm text-muted">
                Dokumen ini tersedia untuk dibaca ulang. This is a read-only
                copy of the Tutor Terms of Service.
              </Text>
            </div>
          ) : (
            <div className="mt-5 flex items-start gap-3 rounded-lg border border-item-border bg-item p-4">
              <Checkbox
                id="tutor-terms-of-service-accepted"
                checked={accepted}
                disabled={isSubmitting}
                onCheckedChange={(checked) =>
                  onAcceptedChange(checked === true)
                }
              />
              <Field className="min-w-0">
                <FieldLabel htmlFor="tutor-terms-of-service-accepted">
                  Saya telah membaca, memahami, dan menyetujui seluruh Syarat
                  dan Ketentuan Kemitraan Tutor Cogito Academy.
                </FieldLabel>
                <FieldDescription>
                  I have read, understood, and agree to the Cogito Academy Tutor
                  Terms of Service.
                </FieldDescription>
              </Field>
            </div>
          )}
        </DialogBody>

        <DialogFooter className="flex-col-reverse items-stretch sm:flex-row sm:items-center">
          <DialogClose
            disabled={isSubmitting}
            render={
              <Button
                variant="tertiary"
                type="button"
                aria-label={readOnly ? "Close" : "Cancel"}
              />
            }
          >
            {readOnly ? "Close" : "Cancel"}
          </DialogClose>
          {!readOnly ? (
            <Button
              type="button"
              progress={isSubmitting}
              disabled={!accepted || isSubmitting}
              onClick={() => void onAccept()}
            >
              Accept &amp; Complete Profile
            </Button>
          ) : null}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
