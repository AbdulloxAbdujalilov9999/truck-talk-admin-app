/* Truck Talk — interface language (English / O'zbek / Русский).
 *
 * Only the *interface* is translated here: page names, buttons,
 * instructions, feedback. Course content (English words, phrases, dialogues,
 * quiz questions, grammar explanations and their Uzbek translations) is
 * never touched by this file.
 *
 * Keys are the English text itself, so a missing translation just falls back
 * to English. {name} placeholders are filled from the second argument:
 *   t("Day {n} is locked", { n: 3 })
 * Loaded as a plain <script> (before app.js / the auth gate) and exposes
 * window.TT_t, window.TT_lang(), window.TT_setLang(), window.TT_langs.
 */
(function(){
"use strict";

const LANGS = [
  { code: "en", label: "English", short: "EN" },
  { code: "uz", label: "O'zbekcha", short: "UZ" },
  { code: "ru", label: "Русский", short: "RU" },
];
const KEY = "tt_lang_v1";

function detect(){
  try{
    const saved = localStorage.getItem(KEY);
    if (saved && LANGS.some(l => l.code === saved)) return saved;
  }catch(e){}
  const nav = ((navigator.languages && navigator.languages[0]) || navigator.language || "en").toLowerCase();
  if (nav.startsWith("uz")) return "uz";
  if (nav.startsWith("ru")) return "ru";
  return "en";
}
let current = detect();

const D = {
/* ---- navigation ---- */
"nav.home":       { en:"Home",     uz:"Asosiy", ru:"Главная" },
"nav.lessons":    { en:"Lessons",  uz:"Darslar",     ru:"Уроки" },
"nav.grammar":    { en:"Grammar",  uz:"Grammatika",  ru:"Грамматика" },
"nav.homework":   { en:"Homework", uz:"Vazifa",      ru:"Задания" },
"nav.progress":   { en:"Progress", uz:"Natija",      ru:"Прогресс" },
"nav.settings":   { en:"Settings", uz:"Sozlama",     ru:"Настройки" },
"ENGLISH FOR THE ROAD": { uz:"YO'L UCHUN INGLIZ TILI", ru:"АНГЛИЙСКИЙ ДЛЯ ДОРОГИ" },
"Language": { uz:"Til", ru:"Язык" },

/* ---- dashboard ---- */
"Good morning": { uz:"Xayrli tong", ru:"Доброе утро" },
"Good afternoon": { uz:"Xayrli kun", ru:"Добрый день" },
"Good evening": { uz:"Xayrli kech", ru:"Добрый вечер" },
"TRUCK TALK ENGLISH": { uz:"TRUCK TALK INGLIZ TILI", ru:"TRUCK TALK АНГЛИЙСКИЙ" },
"Your 60-Day Route": { uz:"Sizning 60 kunlik yo'lingiz", ru:"Ваш 60-дневный маршрут" },
"Let's start the road to speaking English with confidence.": { uz:"Ingliz tilida ishonch bilan gapirish yo'lini boshlaymiz.", ru:"Начнём путь к уверенной английской речи." },
"{n} of 60 days driven — keep rolling.": { uz:"60 kundan {n} tasi o'tildi — davom eting.", ru:"Пройдено {n} из 60 дней — так держать." },
"DAY": { uz:"KUN", ru:"ДЕНЬ" },
"START HERE": { uz:"SHU YERDAN BOSHLANG", ru:"НАЧНИТЕ ЗДЕСЬ" },
"UP NEXT": { uz:"KEYINGISI", ru:"ДАЛЕЕ" },
"UP NEXT · REVIEW DAY": { uz:"KEYINGISI · TAKRORLASH KUNI", ru:"ДАЛЕЕ · ДЕНЬ ПОВТОРЕНИЯ" },
"{n} steps · {a}–{b} min": { uz:"{n} qadam · {a}–{b} daqiqa", ru:"{n} шагов · {a}–{b} мин" },
"Start": { uz:"Boshlash", ru:"Начать" },
"Continue": { uz:"Davom etish", ru:"Продолжить" },
"Day streak": { uz:"Ketma-ket kun", ru:"Дней подряд" },
"XP earned": { uz:"To'plangan XP", ru:"Набрано XP" },
"Homework": { uz:"Uy vazifasi", ru:"Домашние задания" },
"Edit your name": { uz:"Ismni o'zgartirish", ru:"Изменить имя" },
"Set your name": { uz:"Ismingizni kiriting", ru:"Укажите имя" },
"Role-play": { uz:"Rolli suhbat", ru:"Диалог по ролям" },
"Talk it out": { uz:"Gapirib ko'ring", ru:"Поговорите вслух" },
"20 new words": { uz:"20 ta yangi so'z", ru:"20 новых слов" },
"Grammar": { uz:"Grammatika", ru:"Грамматика" },
"Learn the rules": { uz:"Qoidalarni o'rganing", ru:"Изучайте правила" },
"The Highway": { uz:"Katta yo'l", ru:"Магистраль" },
"Every dot is one lesson day. Blue outline = unlocked. Green = completed. Grey = locked. Dashed = review day.": { uz:"Har bir nuqta — bitta dars kuni. Ko'k chiziq = ochiq. Yashil = tugagan. Kulrang = yopiq. Uzuq chiziq = takrorlash kuni.", ru:"Каждая точка — один день. Синяя рамка = открыт. Зелёный = пройден. Серый = закрыт. Пунктир = день повторения." },
"Completed": { uz:"Tugagan", ru:"Пройдено" },
"Unlocked": { uz:"Ochiq", ru:"Открыт" },
"Locked": { uz:"Yopiq", ru:"Закрыт" },
"Review day": { uz:"Takrorlash kuni", ru:"День повторения" },
"Weeks (Exits 1&ndash;12)": { uz:"Haftalar (1&ndash;12-chiqish)", ru:"Недели (съезды 1&ndash;12)" },
"Day {n} is locked. Complete Day {p} first, or turn on Free Navigation in Settings.": { uz:"{n}-kun yopiq. Avval {p}-kunni tugating yoki Sozlamalarda «Erkin o'tish»ni yoqing.", ru:"День {n} закрыт. Сначала завершите день {p} или включите «Свободную навигацию» в настройках." },
"What's your name?": { uz:"Ismingiz nima?", ru:"Как вас зовут?" },
"EXIT {n}": { uz:"{n}-CHIQISH", ru:"СЪЕЗД {n}" },
"{a}/{b} days": { uz:"{a}/{b} kun", ru:"{a}/{b} дн." },

/* ---- lessons list / week ---- */
"All Lessons": { uz:"Barcha darslar", ru:"Все уроки" },
"12 weeks · 60 days · trucking & logistics English": { uz:"12 hafta · 60 kun · yuk mashinasi va logistika inglizchasi", ru:"12 недель · 60 дней · английский для дальнобойщиков и логистики" },
"&larr; All Lessons": { uz:"&larr; Barcha darslar", ru:"&larr; Все уроки" },
"WEEK {n} OF 12": { uz:"12 HAFTADAN {n}-HAFTA", ru:"НЕДЕЛЯ {n} ИЗ 12" },
"{a}/{b} days complete.": { uz:"{a}/{b} kun tugallandi.", ru:"Пройдено дней: {a}/{b}." },
"DAY {n}": { uz:"{n}-KUN", ru:"ДЕНЬ {n}" },
"DAY {n} · REVIEW": { uz:"{n}-KUN · TAKRORLASH", ru:"ДЕНЬ {n} · ПОВТОРЕНИЕ" },
"Score {n}%": { uz:"Natija {n}%", ru:"Результат {n}%" },

/* ---- lesson page ---- */
"&larr; Week {n}": { uz:"&larr; {n}-hafta", ru:"&larr; Неделя {n}" },
"&larr; Day": { uz:"&larr; Kun", ru:"&larr; День" },
"&larr; Day {n}": { uz:"&larr; {n}-kun", ru:"&larr; День {n}" },
"Day {n} &rarr;": { uz:"{n}-kun &rarr;", ru:"День {n} &rarr;" },
"WEEK {n}": { uz:"{n}-HAFTA", ru:"НЕДЕЛЯ {n}" },
"REVIEW DAY": { uz:"TAKRORLASH KUNI", ru:"ДЕНЬ ПОВТОРЕНИЯ" },
"Day {n}: {title}": { uz:"{n}-kun: {title}", ru:"День {n}: {title}" },
"{a}–{b} min": { uz:"{a}–{b} daqiqa", ru:"{a}–{b} мин" },
"✓ Completed · score {n}%": { uz:"✓ Tugallandi · natija {n}%", ru:"✓ Пройдено · результат {n}%" },
"Vocabulary": { uz:"So'zlar", ru:"Слова" },
"Dialogue": { uz:"Dialog", ru:"Диалог" },
"Practice": { uz:"Mashq", ru:"Практика" },
"Tip": { uz:"Maslahat", ru:"Совет" },
"Quiz": { uz:"Test", ru:"Тест" },
"Speaking": { uz:"Gapirish", ru:"Речь" },
"Notes": { uz:"Yozuvlar", ru:"Заметки" },
"Review Quiz": { uz:"Takrorlash testi", ru:"Тест-повторение" },
"Speaking Scenario": { uz:"Gapirish mashqi", ru:"Разговорная ситуация" },
"Next: {name}": { uz:"Keyingisi: {name}", ru:"Далее: {name}" },
"&larr; {name}": { uz:"&larr; {name}", ru:"&larr; {name}" },

/* ---- vocabulary ---- */
"Tap a card to see the Uzbek and an example. Tap the speaker to hear the word.": { uz:"Kartani bosing — o'zbekcha tarjima va misol ochiladi. Karnay belgisini bosing — so'zni eshitasiz.", ru:"Нажмите на карточку — увидите перевод и пример. Нажмите на динамик — услышите слово." },
"Listen to all {n}": { uz:"Hammasini tinglash ({n})", ru:"Слушать все ({n})" },
"tap to flip": { uz:"ag'darish uchun bosing", ru:"нажмите, чтобы перевернуть" },
"Listen": { uz:"Tinglash", ru:"Слушать" },
"Speech is not supported in this browser.": { uz:"Bu brauzerda ovoz qo'llab-quvvatlanmaydi.", ru:"Этот браузер не поддерживает озвучивание." },

/* ---- dialogue ---- */
"A real conversation from the road. Tap the speaker on any line to hear it.": { uz:"Yo'ldagi haqiqiy suhbat. Istalgan gapni eshitish uchun karnay belgisini bosing.", ru:"Настоящий разговор в дороге. Нажмите на динамик у любой фразы, чтобы послушать." },
"Play full dialogue": { uz:"Butun dialogni eshitish", ru:"Слушать весь диалог" },
"Now you try": { uz:"Endi o'zingiz urinib ko'ring", ru:"Теперь попробуйте сами" },

/* ---- role-play ---- */
"No dialogue available for this day.": { uz:"Bu kun uchun dialog yo'q.", ru:"Для этого дня нет диалога." },
"ROLE-PLAY": { uz:"ROLLI SUHBAT", ru:"ДИАЛОГ ПО РОЛЯМ" },
"Have the conversation yourself. The app plays the other person and speaks to you; when it's your turn your line appears on screen — read it out loud and the microphone checks how you did.": { uz:"Suhbatni o'zingiz o'tkazing. Ilova ikkinchi kishi rolini o'ynaydi va sizga gapiradi; navbat sizga kelganda gapingiz ekranda chiqadi — uni ovoz chiqarib o'qing, mikrofon qanday aytganingizni tekshiradi.", ru:"Проведите разговор сами. Приложение играет второго собеседника и говорит с вами; когда очередь ваша, реплика появится на экране — прочитайте её вслух, а микрофон проверит, как у вас получилось." },
"CHOOSE A CONVERSATION FROM THIS WEEK": { uz:"BU HAFTADAN SUHBAT TANLANG", ru:"ВЫБЕРИТЕ ДИАЛОГ ЭТОЙ НЕДЕЛИ" },
"YOU PLAY": { uz:"SIZ ROLNI O'YNAYSIZ", ru:"ВАША РОЛЬ" },
"Challenge mode — hide my lines until I need them": { uz:"Qiyin rejim — gaplarimni kerak bo'lguncha yashirish", ru:"Сложный режим — скрывать мои реплики, пока не понадобятся" },
"We'll ask to use your microphone when you start. Your voice is only used to check your answer.": { uz:"Boshlaganingizda mikrofondan foydalanishga ruxsat so'raymiz. Ovozingiz faqat javobingizni tekshirish uchun ishlatiladi.", ru:"При запуске мы попросим доступ к микрофону. Ваш голос используется только для проверки ответа." },
"Speech checking isn't available in this browser (it works in Chrome, Edge and Safari). You can still practise: read your lines out loud and tap “I said it”.": { uz:"Bu brauzerda ovozni tekshirish mavjud emas (Chrome, Edge va Safari'da ishlaydi). Baribir mashq qilishingiz mumkin: gapingizni ovoz chiqarib o'qing va «Aytdim» tugmasini bosing.", ru:"В этом браузере проверка речи недоступна (работает в Chrome, Edge и Safari). Всё равно можно тренироваться: прочитайте реплику вслух и нажмите «Я сказал»." },
"Start role-play": { uz:"Suhbatni boshlash", ru:"Начать диалог" },
"Your best score on this day: {n}": { uz:"Bu kundagi eng yaxshi natijangiz: {n}", ru:"Ваш лучший результат за этот день: {n}" },
"completed": { uz:"tugallangan", ru:"пройдено" },
"The microphone is blocked for this site. Allow it in your browser's site settings to get scored — for now, read your lines aloud and tap “I said it”.": { uz:"Bu sayt uchun mikrofon bloklangan. Baholanish uchun brauzer sozlamalarida ruxsat bering — hozircha gaplaringizni ovoz chiqarib o'qing va «Aytdim» tugmasini bosing.", ru:"Микрофон заблокирован для этого сайта. Разрешите его в настройках браузера, чтобы получать оценку, а пока читайте реплики вслух и нажимайте «Я сказал»." },
"No microphone was found on this device.": { uz:"Bu qurilmada mikrofon topilmadi.", ru:"На этом устройстве не найден микрофон." },
"The microphone couldn't start.": { uz:"Mikrofonni ishga tushirib bo'lmadi.", ru:"Не удалось включить микрофон." },
" · you": { uz:" · siz", ru:" · вы" },
"YOUR TURN · {role}": { uz:"NAVBAT SIZDA · {role}", ru:"ВАША ОЧЕРЕДЬ · {role}" },
"Show my line": { uz:"Gapimni ko'rsatish", ru:"Показать реплику" },
"Hide my line": { uz:"Gapimni yashirish", ru:"Скрыть реплику" },
"Listening… speak now": { uz:"Tinglayapman… gapiring", ru:"Слушаю… говорите" },
"Hear it": { uz:"Eshitish", ru:"Послушать" },
"Tap again to stop": { uz:"To'xtatish uchun yana bosing", ru:"Нажмите ещё раз, чтобы остановить" },
"Tap the mic and say your line": { uz:"Mikrofonni bosing va gapingizni ayting", ru:"Нажмите на микрофон и произнесите реплику" },
"Stop listening": { uz:"Tinglashni to'xtatish", ru:"Остановить" },
"Tap to speak": { uz:"Gapirish uchun bosing", ru:"Нажмите, чтобы говорить" },
"I said it &rarr;": { uz:"Aytdim &rarr;", ru:"Я сказал &rarr;" },
"CONVERSATION COMPLETE": { uz:"SUHBAT TUGADI", ru:"ДИАЛОГ ЗАВЕРШЁН" },
"Done!": { uz:"Tayyor!", ru:"Готово!" },
"Nice work — you read every line. Use a browser with a microphone (Chrome, Safari) to get scored.": { uz:"Yaxshi — barcha gaplarni o'qidingiz. Baho olish uchun mikrofonli brauzerdan (Chrome, Safari) foydalaning.", ru:"Отлично — вы прочитали все реплики. Чтобы получить оценку, используйте браузер с микрофоном (Chrome, Safari)." },
"Excellent — that sounded confident.": { uz:"Ajoyib — ishonchli eshitildi.", ru:"Отлично — звучало уверенно." },
"Good job. Try once more for a cleaner run.": { uz:"Yaxshi. Yanada aniqroq chiqishi uchun yana bir bor urinib ko'ring.", ru:"Хорошо. Попробуйте ещё раз — получится ещё чище." },
"Keep practising — listen to each line, then say it again slowly.": { uz:"Mashq qilishda davom eting — har bir gapni tinglang, keyin sekin qaytaring.", ru:"Продолжайте тренироваться — послушайте каждую фразу и повторите её медленно." },
"Play again": { uz:"Qayta o'ynash", ru:"Ещё раз" },
"Switch roles": { uz:"Rollarni almashtirish", ru:"Поменяться ролями" },
"You: {role}": { uz:"Siz: {role}", ru:"Вы: {role}" },
"End": { uz:"Tugatish", ru:"Завершить" },
"Typing": { uz:"Yozmoqda", ru:"Печатает" },
"Excellent!": { uz:"Ajoyib!", ru:"Отлично!" },
"Good — that works!": { uz:"Yaxshi — bo'ldi!", ru:"Хорошо — так и надо!" },
"Almost there": { uz:"Deyarli to'g'ri", ru:"Почти получилось" },
"Let's try that again": { uz:"Yana bir bor urinib ko'ramiz", ru:"Попробуем ещё раз" },
"Tip: tap “Hear it”, then say the line slowly, one word at a time.": { uz:"Maslahat: «Eshitish»ni bosing, so'ng gapni sekin, so'zma-so'z ayting.", ru:"Совет: нажмите «Послушать», затем повторите фразу медленно, слово за словом." },
"You said:": { uz:"Siz aytdingiz:", ru:"Вы сказали:" },
"Green words were clear; the underlined red ones need another try.": { uz:"Yashil so'zlar aniq chiqdi; tagi chizilgan qizil so'zlarni yana urinib ko'ring.", ru:"Зелёные слова прозвучали чётко; подчёркнутые красные нужно повторить." },
"Continue &rarr;": { uz:"Davom etish &rarr;", ru:"Продолжить &rarr;" },
"Try again": { uz:"Qayta urinish", ru:"Повторить" },
"Continue anyway": { uz:"Baribir davom etish", ru:"Всё равно продолжить" },
"Speech checking is blocked or unavailable here (allow the microphone in your browser's site settings, or use Chrome/Safari in a normal tab). You can still read your line and tap “I said it”.": { uz:"Bu yerda ovozni tekshirish bloklangan yoki mavjud emas (brauzer sozlamalarida mikrofonga ruxsat bering yoki oddiy oynada Chrome/Safari'dan foydalaning). Baribir gapni o'qib, «Aytdim»ni bosishingiz mumkin.", ru:"Проверка речи здесь заблокирована или недоступна (разрешите микрофон в настройках браузера или используйте Chrome/Safari в обычной вкладке). Всё равно можно прочитать реплику и нажать «Я сказал»." },
"I didn't hear anything — tap the mic and speak a little louder, close to your phone.": { uz:"Hech narsa eshitmadim — mikrofonni bosing va telefonga yaqinroq, balandroq gapiring.", ru:"Ничего не слышно — нажмите на микрофон и говорите чуть громче, ближе к телефону." },
"No microphone was found.": { uz:"Mikrofon topilmadi.", ru:"Микрофон не найден." },
"Speech checking needs an internet connection.": { uz:"Ovozni tekshirish uchun internet kerak.", ru:"Для проверки речи нужен интернет." },
"Couldn't hear that clearly — tap the mic and try again.": { uz:"Aniq eshitilmadi — mikrofonni bosib, qayta urinib ko'ring.", ru:"Не удалось расслышать — нажмите на микрофон и попробуйте снова." },

/* ---- practice ---- */
"Auto-generated from this whole week's vocabulary — a fresh set every time.": { uz:"Shu haftaning barcha so'zlaridan avtomatik tuzilgan — har safar yangi to'plam.", ru:"Составлено автоматически из слов всей недели — каждый раз новый набор." },
"Auto-generated from today's 20 vocabulary words — a fresh set every time.": { uz:"Bugungi 20 ta so'zdan avtomatik tuzilgan — har safar yangi to'plam.", ru:"Составлено автоматически из 20 слов сегодняшнего дня — каждый раз новый набор." },
"New practice set": { uz:"Yangi mashq to'plami", ru:"Новый набор упражнений" },
"FILL IN THE BLANK · {a}/{b} correct": { uz:"BO'SH JOYNI TO'LDIRING · {a}/{b} to'g'ri", ru:"ВСТАВЬТЕ СЛОВО · верно {a}/{b}" },
"MATCH THE WORDS · {a}/{b} matched": { uz:"SO'ZLARNI JUFTLANG · {a}/{b} juftlandi", ru:"СОПОСТАВЬТЕ СЛОВА · {a}/{b}" },
"Tap an English word, then tap its match.": { uz:"Inglizcha so'zni bosing, keyin uning tarjimasini bosing.", ru:"Нажмите на английское слово, затем на его перевод." },
"Matching complete! Nice work.": { uz:"Juftlash tugadi! Yaxshi ish.", ru:"Все пары найдены! Отличная работа." },

/* ---- tip / quiz ---- */
"LANGUAGE TIP": { uz:"TIL MASLAHATI", ru:"СОВЕТ ПО ЯЗЫКУ" },
"{n} questions · cumulative review of this week's vocabulary, plus core comprehension. Answer all, then submit.": { uz:"{n} ta savol · shu haftaning so'zlarini takrorlash va asosiy tushunish. Hammasiga javob bering, keyin yuboring.", ru:"Вопросов: {n} · повторение слов недели и понимание. Ответьте на все и отправьте." },
"{n} questions · core comprehension plus auto-generated vocabulary practice. Answer all, then submit to complete the day.": { uz:"{n} ta savol · asosiy tushunish va avtomatik so'z mashqi. Hammasiga javob bering, keyin kunni tugatish uchun yuboring.", ru:"Вопросов: {n} · понимание и словарные упражнения. Ответьте на все и отправьте, чтобы завершить день." },
"✓ Correct": { uz:"✓ To'g'ri", ru:"✓ Верно" },
"✗ Correct answer: {a}": { uz:"✗ To'g'ri javob: {a}", ru:"✗ Правильный ответ: {a}" },
"Score: {n}%": { uz:"Natija: {n}%", ru:"Результат: {n}%" },
"Great work!": { uz:"Ajoyib ish!", ru:"Отличная работа!" },
"Review the material and try again.": { uz:"Materialni takrorlab, qayta urinib ko'ring.", ru:"Повторите материал и попробуйте снова." },
"Retake with a fresh set": { uz:"Yangi savollar bilan qayta topshirish", ru:"Пройти заново с новым набором" },
"Submit answers": { uz:"Javoblarni yuborish", ru:"Отправить ответы" },
"Please answer every question before submitting.": { uz:"Yuborishdan oldin barcha savollarga javob bering.", ru:"Ответьте на все вопросы перед отправкой." },
"Day {n} complete! +XP earned.": { uz:"{n}-kun tugadi! +XP olindi.", ru:"День {n} завершён! +XP получено." },
"Day {n} complete. Consider reviewing the material again.": { uz:"{n}-kun tugadi. Materialni yana takrorlashni o'ylab ko'ring.", ru:"День {n} завершён. Советуем повторить материал." },
"Review quiz submitted — score {n}%.": { uz:"Takrorlash testi yuborildi — natija {n}%.", ru:"Тест-повторение отправлен — результат {n}%." },

/* ---- speaking / notes ---- */
"SPEAKING PRACTICE": { uz:"GAPIRISH MASHQI", ru:"РАЗГОВОРНАЯ ПРАКТИКА" },
"TRY SAYING A LINE FROM TODAY'S DIALOGUE:": { uz:"BUGUNGI DIALOGDAN BIR GAPNI AYTIB KO'RING:", ru:"ПОПРОБУЙТЕ ПРОИЗНЕСТИ ФРАЗУ ИЗ СЕГОДНЯШНЕГО ДИАЛОГА:" },
"Start Radio Check": { uz:"Ovozni tekshirishni boshlash", ru:"Начать проверку" },
"Mic not supported in this browser": { uz:"Bu brauzerda mikrofon qo'llab-quvvatlanmaydi", ru:"Микрофон не поддерживается в этом браузере" },
"Speech recognition works best in Chrome-based browsers. You can still practice by reading the prompt aloud.": { uz:"Ovozni aniqlash Chrome asosidagi brauzerlarda yaxshi ishlaydi. Baribir topshiriqni ovoz chiqarib o'qib mashq qilishingiz mumkin.", ru:"Распознавание речи лучше всего работает в браузерах на основе Chrome. Тренироваться можно и просто читая задание вслух." },
"Listening…": { uz:"Tinglayapman…", ru:"Слушаю…" },
"You said: “{a}”": { uz:"Siz aytdingiz: «{a}»", ru:"Вы сказали: «{a}»" },
"Match: {n}% — Nice work!": { uz:"Moslik: {n}% — Yaxshi ish!", ru:"Совпадение: {n}% — Отлично!" },
"Match: {n}% — Getting there, try again.": { uz:"Moslik: {n}% — Yaqin qoldingiz, qayta urinib ko'ring.", ru:"Совпадение: {n}% — Уже близко, попробуйте ещё." },
"Match: {n}% — Try again, speak clearly.": { uz:"Moslik: {n}% — Qayta urinib ko'ring, aniq gapiring.", ru:"Совпадение: {n}% — Повторите, говорите чётче." },
"Couldn't hear you clearly. Try again.": { uz:"Aniq eshitilmadi. Qayta urinib ko'ring.", ru:"Не удалось расслышать. Попробуйте снова." },
"YOUR NOTES": { uz:"YOZUVLARINGIZ", ru:"ВАШИ ЗАМЕТКИ" },
"Personal notes are saved on this device only.": { uz:"Shaxsiy yozuvlar faqat shu qurilmada saqlanadi.", ru:"Личные заметки сохраняются только на этом устройстве." },
"Write anything you want to remember about today's lesson...": { uz:"Bugungi dars haqida esda saqlamoqchi bo'lgan narsangizni yozing...", ru:"Запишите всё, что хотите запомнить об уроке..." },
"Save note": { uz:"Yozuvni saqlash", ru:"Сохранить заметку" },
"Note saved.": { uz:"Yozuv saqlandi.", ru:"Заметка сохранена." },

/* ---- homework ---- */
"HOMEWORK": { uz:"UY VAZIFASI", ru:"ДОМАШНЕЕ ЗАДАНИЕ" },
"Vocabulary Homework": { uz:"So'zlar bo'yicha uy vazifasi", ru:"Домашнее задание по словам" },
"Every word from the 60-day course, split into {n} sessions of {size} words each. Expand a session to study its words, then pass the quiz — that's the only way to mark it complete.": { uz:"60 kunlik kursdagi barcha so'zlar, har biri {size} tadan {n} ta mashg'ulotga bo'lingan. Mashg'ulotni oching, so'zlarni o'rganing va testdan o'ting — mashg'ulot faqat shu bilan tugaydi.", ru:"Все слова 60-дневного курса разбиты на {n} занятий по {size} слов. Откройте занятие, изучите слова и пройдите тест — только так оно засчитывается." },
"Sessions complete": { uz:"Tugallangan mashg'ulotlar", ru:"Пройдено занятий" },
"Glossary — Study & Quiz": { uz:"Lug'at — o'rganish va test", ru:"Словарь — учёба и тест" },
"{n} words total. Search to jump to a word, or expand any session below to study its 20 words.": { uz:"Jami {n} ta so'z. So'zni qidiring yoki pastdagi istalgan mashg'ulotni ochib, uning 20 ta so'zini o'rganing.", ru:"Всего слов: {n}. Найдите слово через поиск или откройте любое занятие ниже, чтобы выучить его 20 слов." },
"Search a word, e.g. 'weigh station'...": { uz:"So'z qidiring, masalan: 'weigh station'...", ru:"Найдите слово, например 'weigh station'..." },
"No words found.": { uz:"So'z topilmadi.", ru:"Слова не найдены." },
"Session {n}": { uz:"{n}-mashg'ulot", ru:"Занятие {n}" },
"SESSION {n}": { uz:"{n}-MASHG'ULOT", ru:"ЗАНЯТИЕ {n}" },
"{n} words": { uz:"{n} ta so'z", ru:"Слов: {n}" },
"{n} words in this session.": { uz:"Bu mashg'ulotda {n} ta so'z.", ru:"Слов в этом занятии: {n}." },
"Play all": { uz:"Hammasini eshitish", ru:"Слушать все" },
"Take the Quiz": { uz:"Testni topshirish", ru:"Пройти тест" },
"Retake the Quiz": { uz:"Testni qayta topshirish", ru:"Пройти тест заново" },
"&larr; Homework": { uz:"&larr; Uy vazifasi", ru:"&larr; Домашние задания" },
"&larr; Prev": { uz:"&larr; Oldingi", ru:"&larr; Назад" },
"Next &rarr;": { uz:"Keyingi &rarr;", ru:"Далее &rarr;" },
"HOMEWORK · SESSION {n} OF {total}": { uz:"UY VAZIFASI · {total} TADAN {n}-MASHG'ULOT", ru:"ЗАДАНИЕ · ЗАНЯТИЕ {n} ИЗ {total}" },
"{n} Words to Learn": { uz:"O'rganiladigan so'zlar: {n} ta", ru:"Слов для изучения: {n}" },
"✓ Completed · score {n}%": { uz:"✓ Tugallandi · natija {n}%", ru:"✓ Пройдено · результат {n}%" },
"Study, then quiz below": { uz:"O'rganing, keyin pastdagi testni topshiring", ru:"Учите, затем пройдите тест ниже" },
"Read through all {n} words, then scroll down for the quiz.": { uz:"Barcha {n} ta so'zni o'qib chiqing, keyin test uchun pastga tushing.", ru:"Прочитайте все {n} слов, затем прокрутите вниз к тесту." },
"Play all words": { uz:"Barcha so'zlarni eshitish", ru:"Слушать все слова" },
"Quiz — Finish This to Complete the Homework": { uz:"Test — vazifani tugatish uchun buni yakunlang", ru:"Тест — завершите его, чтобы закончить задание" },
"{n} questions — one for every word above. Answer all, then submit to complete this session.": { uz:"{n} ta savol — yuqoridagi har bir so'z uchun bittadan. Hammasiga javob bering va mashg'ulotni tugatish uchun yuboring.", ru:"Вопросов: {n} — по одному на каждое слово выше. Ответьте на все и отправьте, чтобы завершить занятие." },
"Great work! Homework complete.": { uz:"Ajoyib ish! Vazifa tugadi.", ru:"Отличная работа! Задание выполнено." },
"Homework complete — consider reviewing the words you missed.": { uz:"Vazifa tugadi — xato qilgan so'zlaringizni takrorlang.", ru:"Задание выполнено — повторите слова, в которых были ошибки." },
"Retake quiz": { uz:"Testni qayta topshirish", ru:"Пройти тест заново" },
"Submit and finish homework": { uz:"Yuborish va vazifani tugatish", ru:"Отправить и завершить задание" },
"Session {n} homework complete! +XP earned.": { uz:"{n}-mashg'ulot vazifasi tugadi! +XP olindi.", ru:"Задание занятия {n} выполнено! +XP получено." },

/* ---- grammar ---- */
"GRAMMAR BOOK": { uz:"GRAMMATIKA KITOBI", ru:"КНИГА ГРАММАТИКИ" },
"English Grammar for the Road": { uz:"Yo'l uchun ingliz grammatikasi", ru:"Английская грамматика для дороги" },
"{n} units built specifically for Uzbek speakers, grouped into {c} topics — each one calls out exactly where English and Uzbek grammar pull in different directions. Browse in any order, any time — nothing here is locked.": { uz:"O'zbek tilida so'zlashuvchilar uchun maxsus tuzilgan {n} ta bo'lim, {c} ta mavzuga guruhlangan — har birida ingliz va o'zbek grammatikasi aynan qayerda farq qilishi ko'rsatilgan. Istalgan tartibda, istalgan vaqtda o'qing — bu yerda hech narsa yopiq emas.", ru:"{n} разделов специально для узбекоговорящих, сгруппированы в {c} тем — в каждом показано, чем английская грамматика отличается от узбекской. Читайте в любом порядке и в любое время — здесь ничего не заблокировано." },
"Units complete": { uz:"Tugallangan bo'limlar", ru:"Пройдено разделов" },
"Topics": { uz:"Mavzular", ru:"Темы" },
"{n} UNIT": { uz:"{n} TA BO'LIM", ru:"РАЗДЕЛОВ: {n}" },
"{n} UNITS": { uz:"{n} TA BO'LIM", ru:"РАЗДЕЛОВ: {n}" },
"{a}/{b} complete": { uz:"{a}/{b} tugallandi", ru:"Пройдено {a}/{b}" },
"&larr; Grammar Book": { uz:"&larr; Grammatika kitobi", ru:"&larr; Книга грамматики" },
"{n} unit in this topic · {d} complete.": { uz:"Bu mavzuda {n} ta bo'lim · {d} tasi tugallandi.", ru:"Разделов в теме: {n} · пройдено: {d}." },
"{n} units in this topic · {d} complete.": { uz:"Bu mavzuda {n} ta bo'lim · {d} tasi tugallandi.", ru:"Разделов в теме: {n} · пройдено: {d}." },
"Not started": { uz:"Boshlanmagan", ru:"Не начато" },
"✓ Complete · {n}%": { uz:"✓ Tugallandi · {n}%", ru:"✓ Пройдено · {n}%" },
"&larr; {name}": { uz:"&larr; {name}", ru:"&larr; {name}" },
"Explanation": { uz:"Tushuntirish", ru:"Объяснение" },
"Examples": { uz:"Misollar", ru:"Примеры" },
"Common Mistake for Uzbek Speakers": { uz:"O'zbek tilida so'zlashuvchilarning keng tarqalgan xatosi", ru:"Частая ошибка узбекоговорящих" },
"Review the explanation above and try again.": { uz:"Yuqoridagi tushuntirishni takrorlab, qayta urinib ko'ring.", ru:"Повторите объяснение выше и попробуйте снова." },
"Unit complete! +XP earned.": { uz:"Bo'lim tugadi! +XP olindi.", ru:"Раздел пройден! +XP получено." },
"Unit complete. Consider reviewing the explanation again.": { uz:"Bo'lim tugadi. Tushuntirishni yana takrorlashni o'ylab ko'ring.", ru:"Раздел пройден. Советуем ещё раз прочитать объяснение." },

/* ---- progress / certificate ---- */
"Your Progress": { uz:"Sizning natijalaringiz", ru:"Ваш прогресс" },
"Days complete": { uz:"Tugallangan kunlar", ru:"Дней пройдено" },
"Average quiz score": { uz:"O'rtacha test natijasi", ru:"Средний балл тестов" },
"Total XP": { uz:"Jami XP", ru:"Всего XP" },
"You completed the Final Road Test!": { uz:"Siz yakuniy yo'l testini tugatdingiz!", ru:"Вы прошли итоговый дорожный тест!" },
"View / Print Certificate": { uz:"Sertifikatni ko'rish / chop etish", ru:"Открыть / распечатать сертификат" },
"Complete Day 60 (the Final Road Test) to unlock your certificate.": { uz:"Sertifikatni ochish uchun 60-kunni (yakuniy yo'l testini) tugating.", ru:"Пройдите день 60 (итоговый тест), чтобы получить сертификат." },
"{a} of {b} units complete.": { uz:"{b} ta bo'limdan {a} tasi tugallandi.", ru:"Пройдено разделов: {a} из {b}." },
"Grammar Book": { uz:"Grammatika kitobi", ru:"Книга грамматики" },
"Open Grammar Book": { uz:"Grammatika kitobini ochish", ru:"Открыть книгу грамматики" },
"Completed Days": { uz:"Tugallangan kunlar", ru:"Пройденные дни" },
"Day": { uz:"Kun", ru:"День" },
"Date": { uz:"Sana", ru:"Дата" },
"Score": { uz:"Natija", ru:"Результат" },
"No lessons completed yet — head to the Lessons tab to start Day 1.": { uz:"Hali dars tugallanmagan — 1-kunni boshlash uchun «Darslar» bo'limiga o'ting.", ru:"Пока нет пройденных уроков — откройте «Уроки» и начните с дня 1." },
"Enter your name for the certificate:": { uz:"Sertifikat uchun ismingizni kiriting:", ru:"Введите имя для сертификата:" },
"Truck Driver": { uz:"Yuk mashinasi haydovchisi", ru:"Водитель грузовика" },
"TRUCK TALK ENGLISH · 60-DAY COURSE": { uz:"TRUCK TALK INGLIZ TILI · 60 KUNLIK KURS", ru:"TRUCK TALK АНГЛИЙСКИЙ · 60-ДНЕВНЫЙ КУРС" },
"Certificate of Completion": { uz:"Kursni tugatganlik sertifikati", ru:"Сертификат об окончании" },
"This certifies that": { uz:"Ushbu sertifikat shuni tasdiqlaydiki,", ru:"Настоящим подтверждается, что" },
"has successfully completed 60 days of English training in the trucking & logistics field, covering pre-trip inspections, DOT stops, weigh stations, dispatch communication, emergencies, and professional conversation.": { uz:"yuk tashish va logistika sohasida 60 kunlik ingliz tili kursini muvaffaqiyatli tugatdi: reysdan oldingi ko'rik, DOT to'xtatishlari, tarozi punktlari, dispetcher bilan muloqot, favqulodda holatlar va kasbiy suhbat.", ru:"успешно прошёл 60-дневный курс английского языка в сфере грузоперевозок и логистики: предрейсовый осмотр, остановки DOT, весовые станции, общение с диспетчером, чрезвычайные ситуации и профессиональный разговор." },
"Final Road Test Score": { uz:"Yakuniy yo'l testi natijasi", ru:"Результат итогового теста" },
"Print / Save as PDF": { uz:"Chop etish / PDF sifatida saqlash", ru:"Печать / Сохранить как PDF" },
"Close": { uz:"Yopish", ru:"Закрыть" },

/* ---- settings ---- */
"Settings": { uz:"Sozlamalar", ru:"Настройки" },
"Show Uzbek translations": { uz:"O'zbekcha tarjimalarni ko'rsatish", ru:"Показывать узбекский перевод" },
"Toggle bilingual text throughout the course.": { uz:"Kurs bo'ylab ikki tilli matnni yoqish/o'chirish.", ru:"Включить или выключить двуязычный текст в курсе." },
"Interface language": { uz:"Interfeys tili", ru:"Язык интерфейса" },
"Menus, buttons and instructions. Lesson words and their Uzbek translations don't change.": { uz:"Menyular, tugmalar va ko'rsatmalar. Dars so'zlari va ularning o'zbekcha tarjimalari o'zgarmaydi.", ru:"Меню, кнопки и инструкции. Слова уроков и их узбекский перевод не меняются." },
"Free navigation": { uz:"Erkin o'tish", ru:"Свободная навигация" },
"Unlock all 60 days for teaching or preview, instead of sequential unlocking.": { uz:"Ketma-ket ochilish o'rniga o'qitish yoki ko'rish uchun barcha 60 kunni ochish.", ru:"Открыть все 60 дней для обучения или просмотра вместо последовательного открытия." },
"Appearance": { uz:"Ko'rinish", ru:"Оформление" },
"Navy light or dark. “Auto” follows your phone's setting.": { uz:"Och yoki to'q ko'k mavzu. «Avto» telefoningiz sozlamasiga ergashadi.", ru:"Светлая или тёмная тема. «Авто» — как в настройках телефона." },
"Auto": { uz:"Avto", ru:"Авто" },
"Light": { uz:"Och", ru:"Светлая" },
"Dark": { uz:"To'q", ru:"Тёмная" },
"Speech rate": { uz:"Gapirish tezligi", ru:"Скорость речи" },
"Slow down the pronunciation audio for beginners.": { uz:"Boshlovchilar uchun talaffuzni sekinlashtiring.", ru:"Замедлите произношение для начинающих." },
"Voice": { uz:"Ovoz", ru:"Голос" },
"Pick the voice that reads lessons aloud. Role-plays automatically use the other one for whoever you're talking to.": { uz:"Darslarni ovoz chiqarib o'qiydigan ovozni tanlang. Rolli o'yinlarda suhbatdoshingiz uchun avtomatik ikkinchi ovoz ishlatiladi.", ru:"Выберите голос, который читает уроки вслух. В ролевых играх для собеседника автоматически используется второй голос." },
"Voice sounds off?": { uz:"Ovoz g'alati eshitilyaptimi?", ru:"Голос звучит странно?" },
"Apple devices ship a Siri voice we'll pick up automatically if you install one: Settings → Accessibility → Spoken Content → Voices → English. On other devices, voice quality depends on what's built into your phone or browser — Chrome and Edge usually sound best.": { uz:"Apple qurilmalarida Siri ovozi bor — o'rnatsangiz, avtomatik tanlanadi: Sozlamalar → Maxsus imkoniyatlar → Aytib berish → Ovozlar → English. Boshqa qurilmalarda ovoz sifati telefon yoki brauzeringizga bog'liq — odatda Chrome va Edge eng yaxshi eshitiladi.", ru:"На устройствах Apple есть голос Siri — мы подхватим его автоматически, если установить: Настройки → Универсальный доступ → Проговаривание → Голоса → English. На других устройствах качество голоса зависит от телефона или браузера — обычно лучше всего звучат Chrome и Edge." },
"Female (US)": { uz:"Ayol (AQSH)", ru:"Женский (США)" },
"Male (US)": { uz:"Erkak (AQSH)", ru:"Мужской (США)" },
"No voices detected yet — try switching to the Vocabulary tab to trigger a speech request, or use Chrome/Edge for the best voice selection.": { uz:"Hali ovoz topilmadi — «So'zlar» bo'limiga o'tib ko'ring yoki eng yaxshi tanlov uchun Chrome/Edge'dan foydalaning.", ru:"Голоса пока не найдены — откройте вкладку «Слова» или используйте Chrome/Edge для лучшего выбора голосов." },
"Install app": { uz:"Ilovani o'rnatish", ru:"Установить приложение" },
"Add Truck Talk to your home screen for quick, full-screen access — works offline too.": { uz:"Tezroq va to'liq ekranda kirish uchun Truck Talk'ni bosh ekraningizga qo'shing — internetsiz ham ishlaydi.", ru:"Добавьте Truck Talk на главный экран для быстрого доступа на весь экран — работает и без интернета." },
"On iPhone/iPad: tap the Share icon in Safari, then \"Add to Home Screen\".": { uz:"iPhone/iPad'da: Safari'da Ulashish belgisini bosing, so'ng «Bosh ekranga qo'shish»ni tanlang.", ru:"На iPhone/iPad: нажмите значок «Поделиться» в Safari, затем «На экран «Домой»»." },
"Install cancelled.": { uz:"O'rnatish bekor qilindi.", ru:"Установка отменена." },
"Your name": { uz:"Ismingiz", ru:"Ваше имя" },
"Used on the dashboard and your certificate.": { uz:"Bosh sahifada va sertifikatda ishlatiladi.", ru:"Используется на главной странице и в сертификате." },
"Set name": { uz:"Ismni kiritish", ru:"Указать имя" },
"Account": { uz:"Hisob", ru:"Аккаунт" },
"Signed in as {email}": { uz:"Kirdingiz: {email}", ru:"Вы вошли как {email}" },
"Sign out": { uz:"Chiqish", ru:"Выйти" },
"Admin dashboard": { uz:"Admin paneli", ru:"Панель администратора" },
"Manage users, students, progress, and calendars.": { uz:"Foydalanuvchilar, o'quvchilar, natijalar va taqvimlarni boshqarish.", ru:"Управление пользователями, учениками, прогрессом и календарями." },
"Open admin dashboard": { uz:"Admin panelini ochish", ru:"Открыть панель администратора" },
"Advanced: start over": { uz:"Qo'shimcha: boshidan boshlash", ru:"Дополнительно: начать заново" },
"Starting over erases every completed lesson, quiz score, homework session, grammar unit, your XP, streak and notes on this device. It cannot be undone.": { uz:"Boshidan boshlash bu qurilmadagi barcha tugallangan darslar, test natijalari, uy vazifalari, grammatika bo'limlari, XP, ketma-ket kunlar va yozuvlarni o'chiradi. Buni ortga qaytarib bo'lmaydi.", ru:"Начать заново — значит стереть на этом устройстве все пройденные уроки, результаты тестов, домашние задания, разделы грамматики, XP, серию дней и заметки. Отменить это нельзя." },
"Only need to redo one lesson? Ask your teacher — they can reset a single lesson for you without touching the rest.": { uz:"Faqat bitta darsni qayta o'tmoqchimisiz? O'qituvchingizdan so'rang — u qolganlariga tegmasdan bitta darsni tiklab bera oladi.", ru:"Нужно пройти заново только один урок? Попросите учителя — он может сбросить один урок, не трогая остальное." },
"I understand this will reset <b>all</b> of my progress and cannot be undone.": { uz:"Bu <b>butun</b> natijamni o'chirishini va ortga qaytarib bo'lmasligini tushunaman.", ru:"Я понимаю, что это сбросит <b>весь</b> мой прогресс и отменить это нельзя." },
"Erase all my progress": { uz:"Butun natijamni o'chirish", ru:"Стереть весь мой прогресс" },
"Progress reset.": { uz:"Natijalar o'chirildi.", ru:"Прогресс сброшен." },
"Your teacher reset {what} — you can do it again.": { uz:"O'qituvchingiz {what}ni tiklab qo'ydi — uni qaytadan bajarishingiz mumkin.", ru:"Учитель сбросил: {what} — можно пройти снова." },
"Day {n}": { uz:"{n}-kun", ru:"День {n}" },
"Homework session {n}": { uz:"{n}-uy vazifasi mashg'uloti", ru:"Занятие домашнего задания {n}" },
"a grammar unit": { uz:"grammatika bo'limi", ru:"раздел грамматики" },
"{n} items": { uz:"{n} ta narsa", ru:"элементов: {n}" },
"Couldn't play audio. Check your volume and silent mode, or pick another voice in Settings.": { uz:"Ovozni ijro etib bo'lmadi. Ovoz balandligi va «jim rejim»ni tekshiring yoki Sozlamalarda boshqa ovoz tanlang.", ru:"Не удалось воспроизвести звук. Проверьте громкость и беззвучный режим или выберите другой голос в настройках." },
"Listen (unavailable)": { uz:"Tinglash (mavjud emas)", ru:"Слушать (недоступно)" },
"Stop": { uz:"To'xtatish", ru:"Стоп" },

/* ---- sign-in / account gate (shared/auth-gate.js) ---- */
"Sign in": { uz:"Kirish", ru:"Вход" },
"Create your account": { uz:"Hisob yaratish", ru:"Создайте аккаунт" },
"Reset your password": { uz:"Parolni tiklash", ru:"Сброс пароля" },
"New accounts need owner or manager approval before you get access.": { uz:"Yangi hisoblar kirishdan oldin egasi yoki menejer tomonidan tasdiqlanishi kerak.", ru:"Новые аккаунты должны быть одобрены владельцем или менеджером, прежде чем вы получите доступ." },
"We'll email you a reset link.": { uz:"Parolni tiklash havolasini elektron pochtangizga yuboramiz.", ru:"Мы отправим ссылку для сброса на вашу почту." },
"Continue with Google": { uz:"Google orqali davom etish", ru:"Продолжить через Google" },
"Continue with Apple": { uz:"Apple orqali davom etish", ru:"Продолжить через Apple" },
"or": { uz:"yoki", ru:"или" },
"Email": { uz:"Elektron pochta", ru:"Электронная почта" },
"Password": { uz:"Parol", ru:"Пароль" },
"Please wait…": { uz:"Iltimos, kuting…", ru:"Пожалуйста, подождите…" },
"Send reset link": { uz:"Tiklash havolasini yuborish", ru:"Отправить ссылку" },
"Create account": { uz:"Hisob yaratish", ru:"Создать аккаунт" },
"Sign in with email": { uz:"Pochta orqali kirish", ru:"Войти по почте" },
"Back to sign in": { uz:"Kirishga qaytish", ru:"Назад ко входу" },
"Already have an account? Sign in": { uz:"Hisobingiz bormi? Kiring", ru:"Уже есть аккаунт? Войдите" },
"Create an account with email": { uz:"Pochta orqali hisob yaratish", ru:"Создать аккаунт по почте" },
"Forgot password?": { uz:"Parolni unutdingizmi?", ru:"Забыли пароль?" },
"That email already has an account. Try signing in instead.": { uz:"Bu pochta bilan hisob allaqachon bor. Kirib ko'ring.", ru:"Для этой почты уже есть аккаунт. Попробуйте войти." },
"That doesn't look like a valid email address.": { uz:"Bu to'g'ri elektron pochta manziliga o'xshamaydi.", ru:"Это не похоже на адрес электронной почты." },
"Password must be at least 6 characters.": { uz:"Parol kamida 6 ta belgidan iborat bo'lishi kerak.", ru:"Пароль должен содержать не менее 6 символов." },
"Incorrect password.": { uz:"Parol noto'g'ri.", ru:"Неверный пароль." },
"No account found with that email.": { uz:"Bu pochta bilan hisob topilmadi.", ru:"Аккаунт с такой почтой не найден." },
"Incorrect email or password.": { uz:"Pochta yoki parol noto'g'ri.", ru:"Неверная почта или пароль." },
"Too many attempts. Please wait a moment and try again.": { uz:"Juda ko'p urinish. Biroz kutib, qayta urinib ko'ring.", ru:"Слишком много попыток. Подождите немного и повторите." },
"Sign-in was cancelled.": { uz:"Kirish bekor qilindi.", ru:"Вход отменён." },
"An account already exists with this email using a different sign-in method.": { uz:"Bu pochta uchun boshqa kirish usuli bilan hisob allaqachon bor.", ru:"Для этой почты уже есть аккаунт с другим способом входа." },
"This sign-in method isn't turned on yet — ask the owner to enable it in Firebase.": { uz:"Bu kirish usuli hali yoqilmagan — egasidan Firebase'da yoqishni so'rang.", ru:"Этот способ входа ещё не включён — попросите владельца включить его в Firebase." },
"Something went wrong. Please try again.": { uz:"Xatolik yuz berdi. Qayta urinib ko'ring.", ru:"Что-то пошло не так. Попробуйте ещё раз." },
"Google sign-in did not return a credential.": { uz:"Google kirish ma'lumotini qaytarmadi.", ru:"Google не вернул данные для входа." },
/* ---- account gate: profile / pending / restricted / wrong app ---- */
"Complete your profile": { uz:"Profilingizni to'ldiring", ru:"Заполните профиль" },
"Tell us your name to create your account and start your free 3-day trial — no approval needed.": { uz:"Ismingizni ayting — hisobingiz darhol yaratiladi va 3 kunlik bepul sinov muddati boshlanadi, tasdiqlash shart emas.", ru:"Укажите имя — аккаунт создастся сразу, и начнётся бесплатный 3-дневный период, одобрение не требуется." },
"Full name": { uz:"To'liq ism", ru:"Полное имя" },
"Awaiting approval": { uz:"Tasdiqlash kutilmoqda", ru:"Ожидает одобрения" },
"Thanks, {name} — your request is in. An owner or manager needs to approve it before you can get in. This page updates automatically, no need to refresh.": { uz:"Rahmat, {name} — so'rovingiz qabul qilindi. Kirishdan oldin egasi yoki menejer uni tasdiqlashi kerak. Sahifa o'zi yangilanadi, qayta yuklash shart emas.", ru:"Спасибо, {name} — заявка принята. Владелец или менеджер должен её одобрить, чтобы вы могли войти. Страница обновится сама, перезагружать не нужно." },
"Access restricted": { uz:"Kirish cheklangan", ru:"Доступ ограничен" },
"Your access to this platform has been turned off. Contact your owner or manager if you think this is a mistake.": { uz:"Bu platformaga kirishingiz o'chirilgan. Xato deb o'ylasangiz, egasi yoki menejer bilan bog'laning.", ru:"Ваш доступ к платформе отключён. Если это ошибка, свяжитесь с владельцем или менеджером." },
"Redirecting…": { uz:"Yo'naltirilmoqda…", ru:"Перенаправление…" },
"Taking you to the admin dashboard.": { uz:"Sizni admin paneliga olib boryapmiz.", ru:"Переходим в панель администратора." },
"Taking you to the course.": { uz:"Sizni kursga olib boryapmiz.", ru:"Переходим к курсу." },
"Wrong account? Sign out": { uz:"Boshqa hisobmi? Chiqish", ru:"Не тот аккаунт? Выйти" },
"This is the student course": { uz:"Bu o'quvchilar kursi", ru:"Это курс для учеников" },
"This is the admin dashboard": { uz:"Bu admin paneli", ru:"Это панель администратора" },
"Your account is a {role} account — head to the admin dashboard instead.": { uz:"Hisobingiz — {role} hisobi. Buning o'rniga admin paneliga o'ting.", ru:"Ваш аккаунт — {role}. Перейдите в панель администратора." },
"Your account is a student account — head back to the course.": { uz:"Hisobingiz — o'quvchi hisobi. Kursga qayting.", ru:"Ваш аккаунт — ученика. Вернитесь к курсу." },
"Ask your owner or manager for the admin dashboard link.": { uz:"Admin paneli havolasini egasi yoki menejerdan so'rang.", ru:"Попросите у владельца или менеджера ссылку на панель администратора." },
"Ask your owner or manager for the course link.": { uz:"Kurs havolasini egasi yoki menejerdan so'rang.", ru:"Попросите у владельца или менеджера ссылку на курс." },
"Owner": { uz:"Ega", ru:"Владелец" },
"Manager": { uz:"Menejer", ru:"Менеджер" },
"Teacher": { uz:"O'qituvchi", ru:"Учитель" },
"Student": { uz:"O'quvchi", ru:"Ученик" },
"Password reset email sent — check your inbox.": { uz:"Parolni tiklash xati yuborildi — pochtangizni tekshiring.", ru:"Письмо для сброса пароля отправлено — проверьте почту." },
"Free trial ended": { uz:"Bepul sinov muddati tugadi", ru:"Бесплатный пробный период закончился" },
"Thanks, {name} — your free trial has ended. An owner or manager needs to approve your account so you can keep using Truck Talk. This page updates automatically, no need to refresh.": { uz:"Rahmat, {name} — bepul sinov muddatingiz tugadi. Truck Talk'dan foydalanishda davom etish uchun egasi yoki menejer hisobingizni tasdiqlashi kerak. Sahifa o'zi yangilanadi, qayta yuklash shart emas.", ru:"Спасибо, {name} — ваш бесплатный пробный период закончился. Чтобы продолжить пользоваться Truck Talk, владелец или менеджер должен одобрить ваш аккаунт. Страница обновится сама, перезагружать не нужно." },
"Free trial": { uz:"Bepul sinov", ru:"Бесплатный пробный период" },
"{n} days left in your free trial": { uz:"Bepul sinov muddatidan {n} kun qoldi", ru:"Осталось {n} дней бесплатного периода" },
"Your account hasn't been approved yet. Ask an owner or manager to approve it before your trial ends to keep full access.": { uz:"Hisobingiz hali tasdiqlanmagan. To'liq kirishni saqlab qolish uchun sinov muddati tugashidan oldin egasi yoki menejerdan hisobingizni tasdiqlashni so'rang.", ru:"Ваш аккаунт ещё не одобрен. Чтобы сохранить полный доступ, попросите владельца или менеджера одобрить его до окончания пробного периода." },
"Show translations": { uz:"Tarjimalarni ko'rsatish", ru:"Показывать перевод" },
"Show the translation under every English word, sentence and question — in your chosen language (Uzbek by default).": { uz:"Har bir inglizcha so'z, gap va savol ostida tarjimani tanlangan tilingizda ko'rsatish (odatda o'zbekcha).", ru:"Показывать перевод под каждым английским словом, предложением и вопросом — на выбранном вами языке (по умолчанию узбекский)." },
"English original": { uz:"Inglizcha asl matn", ru:"Английский оригинал" },
"What does “{w}” mean?": { uz:"“{w}” nima degani?", ru:"Что означает «{w}»?" },
};

/* Week titles and grammar topics (course structure labels). */
const CONTENT = {
"Survival English & Introductions": { uz:"Omon qolish inglizchasi va tanishuv", ru:"Базовый английский и знакомство" },
"The Truck & Equipment": { uz:"Yuk mashinasi va jihozlar", ru:"Грузовик и оборудование" },
"Pre-Trip Inspection & Road Rules": { uz:"Reysdan oldingi ko'rik va yo'l qoidalari", ru:"Предрейсовый осмотр и правила дороги" },
"Driving & Navigation": { uz:"Haydash va yo'l topish", ru:"Вождение и навигация" },
"Hours of Service & Logbook": { uz:"Ish soatlari va jurnal", ru:"Часы работы и журнал" },
"DOT Inspections & Police Stops": { uz:"DOT tekshiruvlari va politsiya to'xtatishlari", ru:"Проверки DOT и остановки полицией" },
"Weigh Stations & Scales": { uz:"Tarozi punktlari va tarozilar", ru:"Весовые станции и весы" },
"Dispatch & Phone Communication": { uz:"Dispetcher va telefon orqali muloqot", ru:"Диспетчер и разговор по телефону" },
"Pickup & Delivery": { uz:"Yukni olish va yetkazish", ru:"Погрузка и доставка" },
"Breakdowns & Emergencies": { uz:"Buzilishlar va favqulodda holatlar", ru:"Поломки и чрезвычайные ситуации" },
"Trucking Life & Facilities": { uz:"Haydovchi hayoti va qulayliklar", ru:"Жизнь дальнобойщика и сервисы" },
"Career & Advanced Conversation": { uz:"Kasb va ilg'or suhbat", ru:"Карьера и продвинутый разговор" },
"Foundations": { uz:"Asoslar", ru:"Основы" },
"Tenses": { uz:"Zamonlar", ru:"Времена" },
"Questions": { uz:"Savollar", ru:"Вопросы" },
"Modals & Rules": { uz:"Modal fe'llar va qoidalar", ru:"Модальные глаголы и правила" },
"Prepositions & Connectors": { uz:"Predloglar va bog'lovchilar", ru:"Предлоги и союзы" },
"Numbers & Comparisons": { uz:"Sonlar va taqqoslash", ru:"Числа и сравнения" },
"Advanced": { uz:"Ilg'or", ru:"Продвинутый уровень" },
};

function t(key, vars, lang){
  const row = D[key];
  const L = lang || current;   // optional: translate into a specific language, not the interface one
  let s = L === "en" ? (row && row.en) || key : (row && row[L]) || (row && row.en) || key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return s;
}
// Course-structure labels (week titles, grammar topics): translated when
// known, otherwise shown as-is.
function tc(text){
  const row = CONTENT[text];
  return current === "en" || !row ? text : (row[current] || text);
}

const listeners = [];
function setLang(code){
  if (!LANGS.some(l => l.code === code) || code === current) return;
  current = code;
  try{ localStorage.setItem(KEY, code); }catch(e){}
  document.documentElement.lang = code === "uz" ? "uz" : code === "ru" ? "ru" : "en";
  listeners.slice().forEach(fn => { try{ fn(code); }catch(e){} });
}
document.documentElement.lang = current === "uz" ? "uz" : current === "ru" ? "ru" : "en";

window.TT_t = t;
window.TT_tl = (key, vars, lang) => t(key, vars, lang);
window.TT_tc = tc;
window.TT_lang = () => current;
window.TT_setLang = setLang;
window.TT_onLang = (fn) => { listeners.push(fn); };
window.TT_langs = LANGS;
// Small language switcher (EN | UZ | RU) — returns an HTML string; wire it
// up with TT_bindLangSwitch(root).
// "{n} day(s) left in your free trial" — Russian needs a real plural rule
// (1/2-4/5+ take different word forms), so this is computed in code rather
// than as a dictionary entry with a single {n} slot.
function trialDaysPhrase(n){
  if (current === "uz") return `Bepul sinov muddatidan ${n} kun qoldi`;
  if (current === "ru"){
    const mod10 = n % 10, mod100 = n % 100;
    const word = (mod10 === 1 && mod100 !== 11) ? "день" : (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) ? "дня" : "дней";
    return `Осталось ${n} ${word} бесплатного периода`;
  }
  return n === 1 ? `${n} day left in your free trial` : `${n} days left in your free trial`;
}
window.TT_trialDays = trialDaysPhrase;
window.TT_langSwitchHtml = () => `<div class="lang-switch" role="group" aria-label="${t("Language")}">${LANGS.map(l => `<button type="button" data-lang="${l.code}" class="${l.code === current ? "active" : ""}" title="${l.label}">${l.short}</button>`).join("")}</div>`;
window.TT_bindLangSwitch = (root) => {
  (root || document).querySelectorAll("[data-lang]").forEach(b => b.addEventListener("click", () => setLang(b.dataset.lang)));
};
})();
