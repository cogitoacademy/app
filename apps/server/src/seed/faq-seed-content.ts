import type { FaqCategoryKey } from "@cogito-app/api/modules/faq/faq-categories";

// Source: client "Cogito Website FAQ Bilingual Table" (2 Nov 2026).
// Entries keep the client's category order and numbering. `showOnLanding`
// marks the curated six that fit the landing surface limit.
export type FaqSeedEntry = {
  category: FaqCategoryKey;
  questionEn: string;
  answerEn: string;
  questionId: string;
  answerId: string;
  showOnLanding?: boolean;
};

export const FAQ_SEED_ENTRIES: FaqSeedEntry[] = [
  {
    category: "about",
    showOnLanding: true,
    questionEn: "What is Cogito Academy?",
    answerEn:
      "Cogito Academy is a competition coaching academy based in Surabaya, with classes both online and offline. We prepare students for Model UN, World Scholar's Cup, debate, essay writing and other academic competitions, with tutors who have won these competitions themselves.",
    questionId: "Apa itu Cogito Academy?",
    answerId:
      "Cogito Academy adalah akademi persiapan lomba yang berbasis di Surabaya, dengan kelas online maupun offline. Kami menyiapkan siswa untuk Model UN, World Scholar's Cup, debat, essay, dan lomba akademik lainnya, bersama tutor yang pernah juara di lomba-lomba tersebut.",
  },
  {
    category: "about",
    questionEn: "Are classes online or offline?",
    answerEn:
      "Both. Online classes run on Google Meet and can be joined from anywhere. Offline classes are held in Surabaya. The tutors and curriculum are the same either way, so the choice comes down to what fits your schedule and location.",
    questionId: "Kelasnya online atau offline?",
    answerId:
      "Dua-duanya bisa. Kelas online berjalan lewat Google Meet dan bisa diikuti dari mana saja. Kelas offline diadakan di Surabaya. Tutor dan kurikulumnya sama, jadi tinggal pilih yang paling cocok dengan jadwal dan lokasi.",
  },
  {
    category: "about",
    questionEn: "I don't live in Surabaya. Can I still join?",
    answerEn:
      "Yes. Our students join from cities across Indonesia, and we have worked with partners across Asia, including Pakistan, India and Myanmar. Online, you get the same tutors and curriculum as students in Surabaya.",
    questionId: "Saya tidak tinggal di Surabaya. Apakah tetap bisa ikut?",
    answerId:
      "Bisa. Siswa kami berasal dari berbagai kota di Indonesia, dan Cogito sudah bekerja sama dengan mitra di berbagai negara Asia, termasuk Pakistan, India, dan Myanmar. Lewat kelas online, tutor dan kurikulumnya sama dengan siswa di Surabaya.",
  },
  {
    category: "about",
    questionEn: "What age is Cogito for?",
    answerEn:
      "There is no minimum age. Most of our students are 10 to 18 years old, and the largest group is 13 to 16.",
    questionId: "Cogito untuk usia berapa?",
    answerId:
      "Tidak ada batas usia minimum. Sebagian besar siswa kami berusia 10 sampai 18 tahun, dan yang paling banyak berusia 13 sampai 16 tahun.",
  },
  {
    category: "about",
    showOnLanding: true,
    questionEn: "What makes Cogito different from other tutoring?",
    answerEn:
      "Every tutor has won at national or international level, so they teach from their own experience. Classes are mostly practice: about 15 to 20 minutes of explanation, then speaking, writing or debating with feedback. Every session runs a full 90 minutes and ends with a written report.",
    questionId: "Apa bedanya Cogito dengan tempat les lain?",
    answerId:
      "Semua tutor kami pernah juara di tingkat nasional atau internasional, jadi mereka mengajar dari pengalaman sendiri. Kelasnya lebih banyak praktik: sekitar 15 sampai 20 menit penjelasan, lalu siswa langsung berlatih bicara, menulis, atau debat dengan feedback dari tutor. Setiap sesi berlangsung penuh 90 menit dan ditutup dengan laporan tertulis.",
  },
  {
    category: "about",
    questionEn: "Is Cogito a registered company?",
    answerEn:
      "Yes. Cogito is run by PT Cogito Academy Indonesia, registered with an NIB and NPWP.",
    questionId: "Apakah Cogito terdaftar resmi?",
    answerId:
      "Ya. Cogito dijalankan oleh PT Cogito Academy Indonesia yang terdaftar dengan NIB dan NPWP.",
  },
  {
    category: "programs",
    questionEn: "Which competitions do you prepare students for?",
    answerEn:
      "Seven areas: Model UN, World Scholar's Cup, Essay and Writing, Debate, Business, Olympiad and Public Speaking. Within these we cover more than 30 competitions and formats, in English and Bahasa Indonesia.",
    questionId: "Cogito menyiapkan siswa untuk lomba apa saja?",
    answerId:
      "Ada tujuh bidang: Model UN, World Scholar's Cup, Essay & Writing, Debat, Business, Olimpiade, dan Public Speaking. Di dalamnya ada lebih dari 30 jenis lomba dan format, dalam bahasa Inggris maupun bahasa Indonesia.",
  },
  {
    category: "programs",
    showOnLanding: true,
    questionEn:
      "What's the difference between private classes, cohort classes and masterclasses?",
    answerEn:
      "Private classes are booked whenever you need them, 1-on-1 or in a group of up to six, with the tutor you choose. Cohort classes are a package of meetings with a set schedule and curriculum, for up to 15 students. Masterclasses are one-off open sessions on a single topic, and the most affordable way to learn with us.",
    questionId: "Apa bedanya kelas privat, cohort class, dan masterclass?",
    answerId:
      "Kelas privat bisa dipesan kapan saja sesuai kebutuhan, 1-on-1 atau kelompok maksimal enam orang, dengan tutor pilihan sendiri. Cohort class adalah paket pertemuan dengan jadwal dan kurikulum yang sudah ditentukan, untuk maksimal 15 siswa. Masterclass adalah sesi terbuka satu kali dengan satu topik, dan menjadi cara paling hemat untuk belajar bersama kami.",
  },
  {
    category: "programs",
    questionEn: "How many meetings do I need before a competition?",
    answerEn:
      "For a first competition, we recommend at least four private meetings, or joining one of our cohort classes. If you have competed before, one or two meetings focused on the new event are usually enough. You can always add more later.",
    questionId: "Berapa kali pertemuan yang dibutuhkan sebelum lomba?",
    answerId:
      "Untuk lomba pertama, kami sarankan minimal empat pertemuan privat, atau ikut salah satu cohort class kami. Kalau sudah pernah ikut lomba sebelumnya, biasanya satu atau dua pertemuan yang fokus pada lomba berikutnya sudah cukup. Pertemuan bisa ditambah kapan saja.",
  },
  {
    category: "programs",
    questionEn: "This is my first competition. Is Cogito right for me?",
    answerEn:
      "Yes. Many of our students start as first-timers. We begin with how the competition works and build up from there, so the first time on stage doesn't feel like a leap into the unknown.",
    questionId: "Ini lomba pertama saya. Apakah Cogito cocok?",
    answerId:
      "Cocok. Banyak siswa kami yang mulai dari nol. Kami mulai dari cara kerja lombanya, lalu naik tingkat sedikit demi sedikit, supaya saat tampil pertama kali siswa sudah tahu apa yang harus dilakukan.",
  },
  {
    category: "programs",
    questionEn:
      "My competition is coming up soon. Can you help me prepare for that specific event?",
    answerEn:
      "Yes. Private sessions can focus entirely on that one competition: its topic, the position paper or case you must submit, and the speeches you will give. Book as early as you can so there is time to revise.",
    questionId:
      "Lombanya sudah dekat. Bisa dibantu persiapan khusus untuk lomba itu?",
    answerId:
      "Bisa. Sesi privat bisa difokuskan penuh pada lomba tersebut: topiknya, position paper atau case yang harus dikumpulkan, sampai speech yang akan dibawakan. Sebaiknya pesan sedini mungkin supaya masih ada waktu untuk revisi.",
  },
  {
    category: "programs",
    questionEn: "How do cohort classes work?",
    answerEn:
      "Each cohort is a package of meetings for one competition. It appears on our platform about two weeks before it starts, with its schedule, tutor and meeting-by-meeting curriculum. Choose the cohort you want, then join the whole series, pay half now and half later, or take single meetings.",
    questionId: "Bagaimana cara kerja cohort class?",
    answerId:
      "Setiap cohort adalah paket pertemuan untuk satu jenis lomba. Cohort tampil di platform sekitar dua minggu sebelum dimulai, lengkap dengan jadwal, tutor, dan kurikulum per pertemuan. Pilih cohort yang diinginkan, lalu ikut seluruh rangkaian, bayar setengah di awal dan setengah kemudian, atau ikut per pertemuan saja.",
  },
  {
    category: "programs",
    questionEn:
      "Do you help with university applications and profile building?",
    answerEn:
      "Not as a separate program yet. For now we focus on competitions, which are one of the strongest parts of a student's profile when applying to university.",
    questionId: "Apakah Cogito membantu persiapan kuliah dan profile building?",
    answerId:
      "Belum sebagai program tersendiri. Saat ini kami fokus pada lomba, yang menjadi salah satu bagian terkuat dari profil siswa saat mendaftar kuliah.",
  },
  {
    category: "programs",
    questionEn: "Can you help with a research competition like OPSI?",
    answerEn:
      "Yes, with brainstorming and writing. We don't have our own lab, but if you have already secured lab access, your tutor can accompany the work there.",
    questionId: "Bisa bantu persiapan lomba riset seperti OPSI?",
    answerId:
      "Bisa, untuk brainstorming dan penulisan. Kami tidak punya laboratorium sendiri, tetapi kalau siswa sudah mendapat akses laboratorium, tutor bisa ikut mendampingi di sana.",
  },
  {
    category: "programs",
    questionEn: "Are classes in English or Bahasa Indonesia?",
    answerEn:
      "Either, depending on the competition and the situation. If a competition is held in Bahasa Indonesia, the coaching is in Bahasa Indonesia too.",
    questionId: "Kelasnya pakai bahasa Inggris atau bahasa Indonesia?",
    answerId:
      "Bisa keduanya, tergantung jenis lomba dan kebutuhan. Kalau lombanya berbahasa Indonesia, kelasnya juga dalam bahasa Indonesia.",
  },
  {
    category: "programs",
    questionEn: "Can I join with my team or friends?",
    answerEn:
      "Yes. A private class can take up to six students, and the cost per person drops with each student who joins. It works well for debate teams or a school delegation preparing together.",
    questionId: "Bisa ikut kelas bersama tim atau teman?",
    answerId:
      "Bisa. Satu kelas privat bisa diikuti sampai enam siswa, dan biaya per orang makin ringan setiap ada siswa tambahan. Cocok untuk tim debat atau delegasi sekolah yang berlatih bersama.",
  },
  {
    category: "tutors",
    questionEn: "Who are the tutors, and how are they selected?",
    answerEn:
      "Every Cogito tutor has won at least three national awards or one international award. Tutors join by invitation, and we review every profile before it goes live. Each tutor also signs our Terms of Service, which sets how they work with students.",
    questionId: "Siapa saja tutornya, dan bagaimana mereka dipilih?",
    answerId:
      "Setiap tutor Cogito minimal pernah meraih tiga penghargaan nasional atau satu penghargaan internasional. Tutor bergabung lewat undangan, dan setiap profil kami tinjau sebelum tampil di platform. Semua tutor juga menandatangani Terms of Service yang mengatur cara mereka bekerja dengan siswa.",
  },
  {
    category: "tutors",
    questionEn: "Can I choose my tutor?",
    answerEn:
      "Yes. When you book a private session, you see the tutors available for that competition, read their profiles and achievements, and pick the one you want. For cohort classes, Cogito sets the tutor and shows them on the cohort page.",
    questionId: "Apakah tutornya bisa dipilih sendiri?",
    answerId:
      "Bisa. Saat memesan sesi privat, akan tampil daftar tutor untuk lomba tersebut lengkap dengan profil dan prestasinya, lalu tinggal pilih tutor yang diinginkan. Untuk cohort class, tutornya ditentukan oleh Cogito dan tercantum di halaman cohort.",
  },
  {
    category: "tutors",
    questionEn: "What if the tutor isn't the right fit?",
    answerEn:
      "Choose a different tutor for your next session; you are never locked in. If something went wrong during a session, tell us and we will follow up.",
    questionId: "Bagaimana kalau tutornya kurang cocok?",
    answerId:
      "Tinggal pilih tutor lain untuk sesi berikutnya, tidak ada keharusan tetap dengan satu tutor. Kalau ada masalah selama sesi, kabari kami dan akan kami tindak lanjuti.",
  },
  {
    category: "tutors",
    questionEn: "Will I have the same tutor every time?",
    answerEn:
      "That's up to you. You can keep booking the same tutor while they have open slots. If you switch, download your session reports and share them with the new tutor, so they know where you left off. Cohort classes keep one main tutor for the series.",
    questionId: "Apakah tutornya selalu sama?",
    answerId:
      "Tergantung pilihan sendiri. Tutor yang sama bisa terus dipesan selama jadwalnya masih tersedia. Kalau berganti tutor, unduh laporan sesi sebelumnya dan bagikan ke tutor baru supaya mereka tahu sampai mana materinya. Cohort class memakai satu tutor utama untuk seluruh rangkaian.",
  },
  {
    category: "tutors",
    questionEn: "Is there a free trial class?",
    answerEn:
      "We don't offer free trials, but you can start with a single session to meet a tutor before committing to more. Masterclasses are also an affordable way to see how we teach.",
    questionId: "Apakah ada kelas percobaan gratis?",
    answerId:
      "Kami tidak menyediakan kelas percobaan gratis, tetapi bisa mulai dengan satu sesi saja untuk mengenal tutornya sebelum lanjut. Masterclass juga bisa menjadi cara hemat untuk merasakan cara kami mengajar.",
  },
  {
    category: "accounts",
    questionEn: "How do I book a class?",
    answerEn:
      "Everything is booked at app.cogitoacademy.id. Create an account, buy Marks, choose the competition, the tutor and a time that suits you, then confirm. The confirmation and class details arrive by email.",
    questionId: "Bagaimana cara memesan kelas?",
    answerId:
      "Semua kelas dipesan lewat app.cogitoacademy.id. Daftar akun, beli Marks, pilih lomba, tutor, dan waktu yang cocok, lalu konfirmasi. Konfirmasi dan detail kelas akan dikirim lewat email.",
  },
  {
    category: "accounts",
    questionEn: "Whose name should the account be in, and who pays?",
    answerEn:
      "The account is in the student's name, because bookings, reports and Marks belong to the student. Parents usually handle the Marks purchase, and the student then uses those Marks to book classes.",
    questionId: "Akunnya atas nama siapa, dan siapa yang membayar?",
    answerId:
      "Akun dibuat atas nama siswa, karena pemesanan, laporan, dan Marks melekat pada siswa. Pembelian Marks biasanya dilakukan oleh orang tua, lalu siswa memakai Marks tersebut untuk memesan kelas.",
  },
  {
    category: "accounts",
    questionEn: "How do online classes work?",
    answerEn:
      "Online classes run on Google Meet. The link is created automatically when you book and sent by email and platform notification. We don't send WhatsApp reminders, so keep an eye on your inbox, including the spam folder.",
    questionId: "Bagaimana kelas online berjalan?",
    answerId:
      "Kelas online berjalan lewat Google Meet. Link-nya dibuat otomatis saat pemesanan dan dikirim lewat email serta notifikasi di platform. Kami tidak mengirim pengingat lewat WhatsApp, jadi pastikan rutin mengecek email, termasuk folder spam.",
  },
  {
    category: "accounts",
    questionEn: "How long is a session, and how many students are in a class?",
    answerEn:
      "Every session is 90 minutes. Private classes are 1-on-1 or up to six students. Cohort classes take up to 15 students.",
    questionId: "Berapa lama satu sesi, dan berapa siswa dalam satu kelas?",
    answerId:
      "Setiap sesi berlangsung 90 menit. Kelas privat bisa 1-on-1 atau sampai enam siswa, sedangkan cohort class maksimal 15 siswa.",
  },
  {
    category: "accounts",
    questionEn: "Who sets the class schedule?",
    answerEn:
      "Tutors publish their open times and you pick the slot that suits you. Cohort classes follow the fixed schedule shown on their page.",
    questionId: "Siapa yang menentukan jadwal kelas?",
    answerId:
      "Tutor membuka jadwal kosongnya di platform, lalu siswa tinggal memilih waktu yang cocok. Cohort class mengikuti jadwal tetap yang tercantum di halaman cohort.",
  },
  {
    category: "accounts",
    questionEn: "How many sessions can I book at once?",
    answerEn:
      "Up to four private sessions in one booking. If you are preparing for a first competition, booking all four together secures the tutor's time in the weeks before the event.",
    questionId: "Berapa sesi yang bisa dipesan sekaligus?",
    answerId:
      "Sampai empat sesi privat dalam sekali pemesanan. Untuk persiapan lomba pertama, sebaiknya keempat sesi dipesan sekaligus supaya jadwal tutor aman di minggu-minggu menjelang lomba.",
  },
  {
    category: "marks",
    questionEn: "What are Marks?",
    answerEn:
      "Marks are Cogito's learning credits. Buy them once and use the same balance for private classes, cohort classes, masterclasses and reviews. The more Marks you buy at once, the cheaper each Mark becomes.",
    questionId: "Apa itu Marks?",
    answerId:
      "Marks adalah kredit belajar di Cogito. Cukup beli sekali, lalu saldo yang sama bisa dipakai untuk kelas privat, cohort class, masterclass, maupun review. Semakin banyak Marks yang dibeli sekaligus, semakin murah harga per Mark.",
  },
  {
    category: "marks",
    showOnLanding: true,
    questionEn: "How much does a class cost?",
    answerEn:
      "It depends on the type of class and how many Marks you buy at once. In rupiah, a masterclass starts from about Rp25,000, and a 90-minute private session goes up to about Rp350,000. Cohort meetings sit in between, and cost less per meeting when you join the full series. The exact price of every class is shown in Marks before you book.",
    questionId: "Berapa biaya satu kelas?",
    answerId:
      "Tergantung jenis kelas dan jumlah Marks yang dibeli sekaligus. Kalau dirupiahkan, masterclass mulai dari sekitar Rp25.000, sedangkan sesi privat 90 menit paling tinggi sekitar Rp350.000. Harga pertemuan cohort ada di antara keduanya, dan lebih hemat per pertemuan kalau ikut seluruh rangkaian. Harga pasti setiap kelas tampil dalam Marks sebelum memesan.",
  },
  {
    category: "marks",
    questionEn: "Why are sessions 90 minutes, and is it worth the price?",
    answerEn:
      "Many online tutoring sessions last 60 minutes. Ours run a full 90, so a private session gives you 50% more coaching time for a similar price. That extra half hour is where the real practice happens: a full speech with feedback, a complete debate round, or a draft rewritten on the spot. With a tutor who has won the competition and a written report after every session, the cost per minute often comes out lower than a standard 60-minute class.",
    questionId: "Kenapa sesinya 90 menit, dan apakah sepadan dengan harganya?",
    answerId:
      "Banyak les online berlangsung 60 menit. Sesi Cogito berlangsung penuh 90 menit, jadi dengan harga yang mirip, waktu latihannya 50% lebih banyak. Tambahan 30 menit itulah tempat latihan yang sebenarnya: satu speech lengkap dengan feedback, satu ronde debat penuh, atau draft yang langsung diperbaiki saat itu juga. Ditambah tutor yang pernah juara dan laporan tertulis setiap sesi, biaya per menitnya sering lebih rendah dibanding kelas 60 menit pada umumnya.",
  },
  {
    category: "marks",
    questionEn: "Is a group class cheaper?",
    answerEn:
      "Yes, per student. Each extra student adds only a small amount to the class total, which is then split. A Model UN class for two costs 62 Marks in total, so 31 Marks each instead of 50.",
    questionId: "Apakah kelas kelompok lebih murah?",
    answerId:
      "Ya, biaya per siswa jadi lebih ringan. Setiap siswa tambahan hanya menambah sedikit pada total biaya kelas, lalu dibagi rata. Kelas Model UN untuk dua siswa totalnya 62 Marks, jadi masing-masing 31 Marks, bukan 50.",
  },
  {
    category: "marks",
    questionEn: "Which Marks package should I buy?",
    answerEn:
      "There are four packages: Starter, Learner, Explorer and Pioneer. Bigger packages bring the price of each Mark down from Rp7,000 to Rp5,500. If you only need a few Marks to finish a booking, you can top up the exact amount.",
    questionId: "Paket Marks mana yang sebaiknya dibeli?",
    answerId:
      "Ada empat paket: Starter, Learner, Explorer, dan Pioneer. Semakin besar paketnya, harga per Mark turun dari Rp7.000 sampai Rp5.500. Kalau hanya kurang sedikit Marks untuk menyelesaikan pemesanan, bisa top up sesuai jumlah yang dibutuhkan.",
  },
  {
    category: "marks",
    questionEn: "Do Marks expire?",
    answerEn: "No. Purchased Marks and bonus Marks never expire.",
    questionId: "Apakah Marks punya masa berlaku?",
    answerId:
      "Tidak. Marks yang dibeli maupun bonus Marks tidak pernah hangus.",
  },
  {
    category: "marks",
    questionEn: "Do you offer discounts?",
    answerEn:
      "We don't give percentage discounts. Instead, larger packages cost less per Mark, and we reward students with bonus Marks, for example through referrals.",
    questionId: "Apakah ada diskon?",
    answerId:
      "Kami tidak memberikan diskon persentase. Sebagai gantinya, paket yang lebih besar punya harga per Mark yang lebih murah, dan siswa bisa mendapat bonus Marks, misalnya lewat program referral.",
  },
  {
    category: "payments",
    questionEn: "How do I pay?",
    answerEn:
      "Buy Marks on the platform through our payment gateway, then use them to book. It accepts most common methods, including QRIS, bank transfer and virtual accounts from many banks.",
    questionId: "Bagaimana cara membayar?",
    answerId:
      "Beli Marks di platform lewat payment gateway kami, lalu gunakan Marks tersebut untuk memesan kelas. Hampir semua metode pembayaran umum bisa dipakai, termasuk QRIS, transfer bank, dan virtual account dari berbagai bank.",
  },
  {
    category: "payments",
    showOnLanding: true,
    questionEn: "Can I get a refund?",
    answerEn:
      "We don't refund in cash. Whenever something is returned to you, it comes back as Marks in your account, ready for any future class. This is also stated on the Marks purchase page.",
    questionId: "Apakah uang bisa dikembalikan?",
    answerId:
      "Kami tidak melakukan pengembalian dalam bentuk uang. Setiap pengembalian masuk sebagai Marks ke akun, dan bisa langsung dipakai untuk kelas berikutnya. Ketentuan ini juga tertulis di halaman pembelian Marks.",
  },
  {
    category: "payments",
    showOnLanding: true,
    questionEn: "What if I need to cancel or reschedule a session?",
    answerEn:
      "Cancel at least 24 hours before the session and your Marks come back, minus a 20% deduction. Cancellations made less than 24 hours before the session are not returned. Rescheduling follows the same rule.",
    questionId: "Bagaimana kalau perlu membatalkan atau mengganti jadwal sesi?",
    answerId:
      "Pembatalan paling lambat 24 jam sebelum sesi akan mengembalikan Marks, dengan potongan 20%. Pembatalan kurang dari 24 jam sebelum sesi tidak mendapat pengembalian. Ketentuan yang sama berlaku untuk penggantian jadwal.",
  },
  {
    category: "payments",
    questionEn:
      "What if the tutor doesn't show up, or the class fails for technical reasons?",
    answerEn:
      "You won't lose anything. The Marks for that session come back to your account in full.",
    questionId:
      "Bagaimana kalau tutor tidak hadir atau kelas gagal karena masalah teknis?",
    answerId:
      "Tidak ada yang dirugikan. Marks untuk sesi tersebut dikembalikan penuh ke akun.",
  },
  {
    category: "payments",
    questionEn: "Can I pay for a cohort class in installments?",
    answerEn:
      "Yes. Pay in full (the cheapest option), in two halves, or session by session. We send an email reminder seven days before a payment is due; seats that stay unpaid are released.",
    questionId: "Apakah cohort class bisa dicicil?",
    answerId:
      "Bisa. Bayar penuh (pilihan paling hemat), dua kali bayar, atau per sesi. Kami mengirim pengingat lewat email tujuh hari sebelum jatuh tempo; kursi yang belum dibayar akan dilepas.",
  },
  {
    category: "payments",
    questionEn: "What happens if a cohort doesn't get enough students?",
    answerEn:
      "We may still run it, postpone it once, or cancel it, and we will let you know by email. If we cancel, you get back all Marks for the sessions not yet held.",
    questionId: "Bagaimana kalau peserta cohort tidak mencukupi?",
    answerId:
      "Cohort bisa tetap berjalan, diundur satu kali, atau dibatalkan, dan kabarnya akan dikirim lewat email. Kalau dibatalkan, semua Marks untuk sesi yang belum berjalan akan dikembalikan.",
  },
  {
    category: "progress",
    questionEn: "How can I track progress?",
    answerEn:
      "After every session the tutor writes a short report: what the session focused on, what went well and what to improve. All reports from the last three months can be downloaded as one PDF, which makes it easy for parents to follow along too.",
    questionId: "Bagaimana cara memantau perkembangan belajar?",
    answerId:
      "Setelah setiap sesi, tutor menulis laporan singkat: fokus sesi, apa yang sudah baik, dan apa yang perlu diperbaiki. Semua laporan tiga bulan terakhir bisa diunduh dalam satu PDF, jadi orang tua juga mudah mengikuti perkembangannya.",
  },
  {
    category: "progress",
    questionEn: "Can you guarantee a win?",
    answerEn:
      "No, and we would be wary of anyone who does. Results depend on the competition, the judges and the work put in. What we promise is coaching from tutors who have won themselves, regular practice with honest feedback, and a clear picture of progress after every session.",
    questionId: "Apakah Cogito menjamin juara?",
    answerId:
      "Tidak, dan sebaiknya berhati-hati dengan pihak yang menjanjikan itu. Hasil lomba bergantung pada lombanya, juri, dan usaha yang dikerahkan. Yang kami janjikan adalah bimbingan dari tutor yang pernah juara, latihan rutin dengan feedback yang jujur, dan gambaran perkembangan yang jelas setiap sesi.",
  },
  {
    category: "progress",
    questionEn: "What is expected of students, and of parents?",
    answerEn:
      "Students should come prepared and do the short homework after each meeting, because skills grow between sessions as much as in them. Parents help most by holding students to that work and encouraging them when practice feels uncomfortable.",
    questionId: "Apa yang diharapkan dari siswa dan orang tua?",
    answerId:
      "Siswa diharapkan datang dengan persiapan dan mengerjakan tugas singkat setelah setiap pertemuan, karena kemampuan berkembang di antara sesi sama besarnya dengan di dalam sesi. Orang tua paling membantu dengan memastikan tugas itu dikerjakan dan memberi semangat saat latihan terasa tidak nyaman.",
  },
  {
    category: "progress",
    questionEn: "Do students get learning materials?",
    answerEn:
      "Yes. Our programs come with modules to read between meetings. Students holding at least 35 Marks can also open our Knowledge Bank, a library of winning examples such as Model UN position papers.",
    questionId: "Apakah siswa mendapat materi belajar?",
    answerId:
      "Ya. Program kami dilengkapi modul untuk dibaca di antara pertemuan. Siswa yang memiliki minimal 35 Marks juga bisa mengakses Knowledge Bank, kumpulan contoh karya juara seperti position paper Model UN.",
  },
  {
    category: "progress",
    questionEn: "Can parents sit in on a class?",
    answerEn:
      "Parents are welcome to check in at the start or end of a session. During practice, most students speak up more without an audience, and the session report shows what was covered.",
    questionId: "Apakah orang tua boleh ikut menonton kelas?",
    answerId:
      "Orang tua boleh menyapa tutor di awal atau akhir sesi. Saat latihan berlangsung, kebanyakan siswa lebih berani bicara tanpa penonton, dan isi sesi tetap bisa dilihat lewat laporan sesi.",
  },
  {
    category: "offline",
    questionEn: "Where are offline classes held in Surabaya?",
    answerEn:
      "At our place on Jl. Dharmahusada Indah Selatan VII, Surabaya. You book offline classes on the platform the same way as online ones. We don't do home visits.",
    questionId: "Di mana lokasi kelas offline di Surabaya?",
    answerId:
      "Di tempat kami, Jl. Dharmahusada Indah Selatan VII, Surabaya. Kelas offline dipesan lewat platform dengan cara yang sama seperti kelas online. Kami tidak melayani kunjungan ke rumah.",
  },
  {
    category: "offline",
    questionEn: "How do you keep students safe?",
    answerEn:
      "Every class is booked and recorded on our platform, and online sessions run on links Cogito creates. Our tutors agree not to exchange personal contacts with students or arrange classes outside Cogito. If anything ever feels wrong, contact us directly.",
    questionId: "Bagaimana Cogito menjaga keamanan siswa?",
    answerId:
      "Semua kelas dipesan dan tercatat di platform kami, dan sesi online memakai link yang dibuat oleh Cogito. Tutor kami sepakat untuk tidak bertukar kontak pribadi dengan siswa atau mengatur kelas di luar Cogito. Kalau ada hal yang terasa tidak beres, langsung hubungi kami.",
  },
  {
    category: "offline",
    questionEn: "Do you work with schools and competition organisers?",
    answerEn:
      "Yes. Our tutors teach extracurricular programs at schools on a regular schedule, such as monthly debate coaching. We also have a dedicated scheme to support schools and organisers running their own competitions, and we host our own Model UN conference, Civitas MUN.",
    questionId:
      "Apakah Cogito bekerja sama dengan sekolah dan penyelenggara lomba?",
    answerId:
      "Ya. Tutor kami mengajar program ekstrakurikuler di sekolah dengan jadwal rutin, misalnya pelatihan debat setiap bulan. Kami juga punya skema khusus untuk mendukung sekolah dan penyelenggara yang mengadakan lomba sendiri, dan kami menyelenggarakan konferensi Model UN sendiri, Civitas MUN.",
  },
  {
    category: "offline",
    questionEn: "Is there a referral program?",
    answerEn:
      "Yes. Share your referral code with a friend. When they sign up and take a paid class, you get bonus Marks that never expire.",
    questionId: "Apakah ada program referral?",
    answerId:
      "Ada. Bagikan kode referral ke teman. Setelah mereka mendaftar dan mengikuti kelas berbayar, pemilik kode akan mendapat bonus Marks yang tidak pernah hangus.",
  },
  {
    category: "offline",
    questionEn: "How can I contact Cogito?",
    answerEn:
      "Email cogitoacademy.id@gmail.com or message @cogitoacademy.id on Instagram. We reply during office hours, and urgent matters can still reach us until 9 pm WIB.",
    questionId: "Bagaimana cara menghubungi Cogito?",
    answerId:
      "Hubungi kami lewat email cogitoacademy.id@gmail.com atau Instagram @cogitoacademy.id. Kami membalas pada jam kerja, dan untuk hal mendesak kami tetap bisa dihubungi sampai pukul 21.00 WIB.",
  },
  {
    category: "tutor-join",
    questionEn: "How do I join Cogito as a tutor?",
    answerEn:
      "Tutors join by invitation. Send your name, email and competition record to our admin by WhatsApp or email. If you meet our standard, we send an invite to create your profile; once it passes review, it goes live and you can set your availability.",
    questionId: "Bagaimana cara bergabung sebagai tutor Cogito?",
    answerId:
      "Tutor bergabung lewat undangan. Kirim nama, email, dan daftar prestasi lomba ke admin kami lewat WhatsApp atau email. Kalau memenuhi standar kami, undangan akan dikirim untuk membuat profil; setelah lolos peninjauan, profil akan tampil dan jadwal mengajar bisa diatur.",
  },
  {
    category: "tutor-join",
    questionEn: "What are the requirements?",
    answerEn:
      "At least three national awards or one international award in the competition you want to teach. We also ask for your NIK and NPWP for tax purposes.",
    questionId: "Apa saja syaratnya?",
    answerId:
      "Minimal tiga penghargaan nasional atau satu penghargaan internasional di lomba yang ingin diajarkan. Kami juga meminta NIK dan NPWP untuk keperluan pajak.",
  },
  {
    category: "tutor-join",
    questionEn: "How are tutors paid?",
    answerEn:
      "Cogito sets a fixed fee per 90-minute session for each competition. The fee rises with every extra student in a group class and is higher for offline classes. Cogito transfers the fee directly, with income tax withheld as required.",
    questionId: "Bagaimana sistem honor tutor?",
    answerId:
      "Cogito menetapkan honor tetap per sesi 90 menit untuk setiap jenis lomba. Honor bertambah untuk setiap siswa tambahan di kelas kelompok, dan lebih tinggi untuk kelas offline. Honor ditransfer langsung oleh Cogito, dengan pemotongan pajak penghasilan sesuai ketentuan.",
  },
  {
    category: "tutor-join",
    questionEn: "Can I choose when and where I teach?",
    answerEn:
      "Yes. You set your own available times on the platform and choose which competitions to teach, up to seven specializations. You can teach online from anywhere, and offline in Surabaya if you are based there.",
    questionId: "Apakah jadwal dan lokasi mengajar bisa dipilih sendiri?",
    answerId:
      "Bisa. Jadwal mengajar diatur sendiri di platform, begitu juga lomba yang ingin diajarkan, maksimal tujuh spesialisasi. Mengajar online bisa dari mana saja, dan offline di Surabaya bagi yang berdomisili di sana.",
  },
  {
    category: "tutor-join",
    questionEn: "What rules do tutors follow?",
    answerEn:
      "Every tutor signs our Terms of Service: no exchanging personal contacts with students and no classes arranged outside Cogito. After each session, tutors submit a short report, which is required for the session to be paid.",
    questionId: "Aturan apa yang berlaku untuk tutor?",
    answerId:
      "Setiap tutor menandatangani Terms of Service kami: tidak bertukar kontak pribadi dengan siswa dan tidak mengatur kelas di luar Cogito. Setelah setiap sesi, tutor mengisi laporan singkat, yang menjadi syarat agar sesi tersebut dibayar.",
  },
];
