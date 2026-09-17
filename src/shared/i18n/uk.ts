import { formatPlanningDuration } from "./planning-format.js";
import type { MessageCatalog } from "./index.js";

export const uk = {
  "planning.lifecycle.plan": () => `план репетиції`,
  "planning.lifecycle.previous": () => `Попередню спробу планування`,
  "planning.lifecycle.slot": ({ value, time }) => `${value} о ${time}`,
  "planning.lifecycle.retired": ({ value }) =>
    `<b>Попереднє повідомлення — ${value}</b>\nЦя копія вже не актуальна. Поточні деталі репетиції — /plan_status.`,
  "planning.lifecycle.cancelPrompt": ({ value }) =>
    `Скасувати ${value}?\nРепетицію буде скасовано.`,
  "planning.lifecycle.changePrompt": ({ value }) =>
    `Змінити ${value}?\nУсі відповідатимуть знову в межах того самого тижня. Щоб обрати інший тиждень, спочатку скасуй репетицію та надішли /plan.`,
  "planning.lifecycle.cancelledHeading": ({ value }) =>
    `<b>Скасовано — ${value}</b>`,
  "planning.lifecycle.superseded": ({ value }) =>
    `${value} — переплановано. Поточний план — /plan_status.`,
  "planning.lifecycle.blockedHeading": ({ value }) =>
    `<b>Час не підходить — ${value}</b>`,
  "planning.lifecycle.blocked": () =>
    `Цей час підходить не всім. Обери іншу дату й час.`,
  "planning.lifecycle.readyHeading": ({ value }) =>
    `<b>Можна бронювати — ${value}</b>`,
  "planning.lifecycle.readyMembers": () => `<b>Усі запрошені можуть:</b>`,
  "planning.lifecycle.ready": () => `Усі можуть! Час бронювати репетицію.`,
  "planning.lifecycle.retractedHeading": ({ value }) =>
    `<b>Ще збираємо відповіді — ${value}</b>`,
  "planning.lifecycle.retracted": () =>
    `Попереднє оголошення вже не актуальне. Залиш відповідь на картці репетиції.`,
  "planning.lifecycle.bookedHeading": ({ value }) =>
    `<b>Студію заброньовано — ${value}</b>`,
  "planning.lifecycle.booked": () =>
    `Студію заброньовано для гурту на цей час.`,
  "planning.lifecycle.bookingHeading": ({ value }) =>
    `<b>Підтвердь бронювання — ${value}</b>`,
  "planning.lifecycle.bookingQuestion": () =>
    `Студію вже заброньовано на цей час?`,
  "planning.lifecycle.bookingEffect": () =>
    `Підтвердь лише якщо гурт уже забронював студію. Це позначить репетицію як заброньовану.`,
  "planning.lifecycle.bookRequest": () => `Студію заброньовано`,
  "planning.lifecycle.bookApply": () => `Так, заброньовано`,
  "planning.lifecycle.bookKeep": () => `Назад`,
  "planning.lifecycle.cancelRequest": () => `✕ Скасувати репетицію`,
  "planning.lifecycle.cancelApply": () => `Так, скасувати`,
  "planning.lifecycle.cancelKeep": () => `Залишити репетицію`,
  "planning.lifecycle.changeRequest": () => `↻ Змінити дату чи час`,
  "planning.lifecycle.changeApply": () => `Так, обрати інший час`,
  "planning.lifecycle.changeKeep": () => `Залишити цей час`,
  "planning.dayHeading": ({ value }) =>
    `<b>Заплануй репетицію — тиждень від ${value}</b>`,
  "planning.timeHeading": ({ value }) => `<b>Заплануй репетицію — ${value}</b>`,
  "planning.reviewHeading": ({ value }) =>
    `<b>Підтвердь репетицію — ${value}</b>`,
  "planning.availabilityHeading": ({ value }) =>
    `<b>Репетицію підтверджено — ${value}</b>`,
  "planning.cancelledHeading": ({ value }) =>
    `<b>Репетицію скасовано — ${value}</b>`,
  "planning.owner": ({ label }) => `Організатор: ${label}`,
  "planning.lineup": ({ total }) =>
    total === 0
      ? "<b>У складі гурту ще нікого немає.</b> Додай учасників через /roster_add перед підтвердженням."
      : `<b>Учасників, яких запитаємо: ${total}</b>`,
  "planning.reviewInstructions": () =>
    "Підтвердження зберігає репетицію та починає збір відповідей: кожен учасник зможе відповісти, чи підходить цей час.",
  "planning.answered": ({ value, total }) =>
    `<b>Відповіли ${value} з ${total}.</b>`,
  "planning.unavailableMembers": ({ label }) => `Не можуть прийти: ${label}.`,
  "planning.chooseDay": () => "Обери день.",
  "planning.chooseTime": () => "Обери час початку.",
  "planning.emptyWindow": () =>
    "Жодна репетиція не вміщується в денні межі цього чату. Зміни їх через /settings.",
  "planning.legend.dayDefault": () => "⭐ звичний день",
  "planning.legend.previous": () => "🔁 минула репетиція",
  "planning.legend.past": () => "🚫 уже минув",
  "planning.legend.timeDefault": () => "⭐ звичний час",
  "planning.legend.unavailable": () => "🚫 недоступний",
  "planning.legend.chosen": () => "✅ твій поточний вибір",
  "planning.legend.pending": () => "⬜ Очікуємо відповідь",
  "planning.legend.available": () => "👍 Може",
  "planning.legend.cannotAttend": () => "👎 Не може",
  "planning.outcome.collecting": () => "Ще збираємо відповіді.",
  "planning.outcome.all-available": () => "Усі можуть прийти.",
  "planning.outcome.blocked": () => "Цей час підходить не всім.",
  "planning.booked": () => "Цю репетицію заброньовано.",
  "planning.cancelled": () => "Цю репетицію скасовано.",
  "planning.control.back": () => "Назад",
  "planning.control.confirm": () => "Підтвердити репетицію",
  "planning.control.takeover": () => "Стати організатором",
  "planning.control.available": () => "👍 Можу",
  "planning.control.unavailable": () => "👎 Не можу",
  "planning.control.replan": () => "↻ Перепланувати",
  "planning.applied": () => "Усе гаразд, цю дію вже виконано.",
  "planning.retrySafe": () =>
    "Ой, щось пішло не так. Спробуй ще раз трохи пізніше.",
  "planning.savedRecovery": () =>
    "Зміну збережено, але картку не вдалося оновити. Поточний стан — /plan_status.",
  "language.failure": () => "Не вдалося зберегти мову. Спробуй ще раз.",
  "language.stale": () =>
    "Ця дія вже недоступна. Відкрий /settings або /setup ще раз.",
  "callback.denied": () => "Це можуть робити лише поточні адміністратори чату.",
  "language.select": () => "Обери мову цього чату.",
  "language.row": () => "Мова: Українська",
  "language.changed": () => "Мову змінено на українську.",
  "language.entry": () => "Мова / Language",
  "language.english": () => "English",
  "language.ukrainian": () => "Українська",
  "timezone.title": () => "Часовий пояс",
  "timezone.intro": () =>
    "Надішли геолокацію у відповідь на це повідомлення, щоб обрати часовий пояс цього чату.",
  "timezone.loading": () => "Шукаю часовий пояс…",
  "timezone.failure": () =>
    "Не вдалося визначити часовий пояс. Надішли точнішу або іншу геолокацію в цій групі.",
  "timezone.another": () => "Надішли іншу геолокацію",
  "setup.review": () => "<b>Перевір налаштування</b>",
  "setup.saved": () => "<b>Налаштування чату збережено</b>",
  "setup.entry": () =>
    "<b>Налаштуй планування репетицій</b>\nЦей чат ще не налаштовано.",
  "setup.start": () => "Почати налаштування",
  "setup.continue": () => "Продовжити налаштування",
  "setup.cancelled": () => "Налаштування скасовано.",
  "setup.stale": () =>
    "Ця дія вже недоступна. Надішли /setup, щоб почати знову.",
  "setup.expired": () =>
    "Час налаштування минув після 30 хвилин бездіяльності. Надішли /setup, щоб почати знову.",
  "input.time": () => "Ой, не вдалося розібрати час. Спробуй так: 19:30.",
  "input.duration": () =>
    "Ой, не вдалося розібрати тривалість. Надішли цілу кількість хвилин, наприклад: 120.",
  "input.schedule": () =>
    "Ой, репетиція не вміщується в денні межі. Зміни не збережено. Наприклад, для репетиції о 19:30 тривалістю 120 хвилин обери кінець дня не раніше 21:30.",
  "input.reminders": () =>
    "Ой, не вдалося розібрати час нагадувань. Спробуй так: 10:00, 16:00.",
  "common.saveFailure": () => "Не вдалося зберегти зміну. Спробуй ще раз.",
  "common.applied": () => "Уже застосовано.",
  "common.stale": () =>
    "Ця дія вже недоступна. Відкрий /settings або /roster і спробуй ще раз.",
  "common.denied": () =>
    "Лише чинні адміністратори чату можуть змінювати налаштування, склад гурту або доступ до планування.",
  "setup.weekday": () => "Обери типовий день репетиції.",
  "setup.startTime": () =>
    "Надішли типовий час початку репетиції у 24-годинному форматі, наприклад <code>19:30</code>.",
  "setup.duration": () =>
    "Надішли тривалість репетиції цілим додатним числом хвилин, наприклад <code>120</code>.",
  "setup.dailyStart": () =>
    "Надішли початок денного проміжку у 24-годинному форматі, наприклад <code>10:00</code>.",
  "setup.dailyEnd": () =>
    "Надішли кінець денного проміжку у 24-годинному форматі, наприклад <code>22:00</code>.",
  "setup.reminders": () =>
    "Типовий час нагадувань про доступність — <code>10:00</code> та <code>16:00</code>.",
  "setup.firstReminder": () =>
    "Надішли час першого нагадування у 24-годинному форматі, наприклад <code>10:00</code>.",
  "setup.secondReminder": () =>
    "Надішли час другого нагадування у 24-годинному форматі, наприклад <code>16:00</code>.",
  "setup.validReminders": () =>
    "Обери два коректні часи нагадувань перед перевіркою.",
  "setup.policy": () =>
    "Хто може запропонувати репетицію?\nТипово — лише адміністратори.",
  "policy.prompt": () => "Хто може запропонувати репетицію?",
  "policy.ADMINS_ONLY": () => "Лише адміністратори",
  "policy.PREVIOUS_PARTICIPANTS": () => "Учасники попереднього планування",
  "policy.ANYONE_IN_CHAT": () => "Усі в чаті",
  "button.defaults": () => "Залишити типовий час",
  "button.editTimes": () => "Змінити час",
  "button.saveConfiguration": () => "Зберегти налаштування",
  "button.cancelSetup": () => "Скасувати налаштування",
  "button.saveChange": () => "Зберегти зміну",
  "button.keepValue": () => "Залишити поточне значення",
  "settings.title": () => "<b>Налаштування чату</b>",
  "settings.schedule": () => "<b>Розклад</b>",
  "settings.reminders": () => "<b>Нагадування про доступність</b>",
  "settings.access": () => "<b>Доступ до планування</b>",
  "settings.review": () => "<b>Перевір зміну</b>",
  "settings.notConfigured": () =>
    "Цей чат ще не налаштовано. Надішли /setup, щоб почати.",
  "settings.failure": () =>
    "Не вдалося завантажити налаштування чату. Спробуй ще раз.",
  "settings.expired": () =>
    "Час зміни налаштувань минув після 30 хвилин бездіяльності. Відкрий /settings, щоб почати знову.",
  "settings.kept": () => "Поточне значення залишено.",
  "settings.saved": () => "Зміну збережено.",
  "settings.weekdayHint": () => "Обери день тижня.",
  "settings.timeHint": () =>
    "Надішли час у 24-годинному форматі, наприклад 19:30.",
  "settings.durationHint": () =>
    "Надішли цілу додатну кількість хвилин, наприклад 120.",
  "settings.remindersHint": () =>
    "Надішли два часи через кому, наприклад 10:00, 16:00.",
  "roster.title": () => "<b>Склад гурту</b>",
  "roster.empty": () => "<b>У гурті ще немає учасників</b>",
  "roster.addHint": () =>
    "Відповідай на повідомлення учасника командою /roster_add, щоб додати його до гурту.",
  "roster.addUsage": () =>
    "Відповідай на повідомлення учасника гурту командою /roster_add, щоб додати його.",
  "roster.loading": () => "Завантажую склад гурту…",
  "roster.failure": () => "Не вдалося завантажити склад гурту. Спробуй ще раз.",
  "roster.consequence": () =>
    "Цей учасник більше не потраплятиме до майбутніх репетицій.",
  "roster.updated": () => "<b>Склад гурту оновлено</b>",
  "roster.cancelled": () => "Видалення скасовано.",
  "roster.add": () => "Додати учасника",
  "roster.remove": () => "Видалити учасника",
  "roster.confirm": () => "Видалити",
  "roster.keep": () => "Залишити учасника",
  "button.previous": () => "Назад",
  "button.next": () => "Далі",
  "button.retry": () => "Спробувати ще раз",
  "field.TIMEZONE": () => "Часовий пояс",
  "edit.TIMEZONE": () => "Змінити часовий пояс",
  "field.DEFAULT_WEEKDAY": () => "Типовий день",
  "edit.DEFAULT_WEEKDAY": () => "Змінити день",
  "field.DEFAULT_START_MINUTE": () => "Типовий початок",
  "edit.DEFAULT_START_MINUTE": () => "Змінити типовий початок",
  "field.DURATION_MINUTES": () => "Тривалість",
  "edit.DURATION_MINUTES": () => "Змінити тривалість",
  "field.DAILY_START_MINUTE": () => "Початок дня",
  "edit.DAILY_START_MINUTE": () => "Змінити початок дня",
  "field.DAILY_END_MINUTE": () => "Кінець дня",
  "edit.DAILY_END_MINUTE": () => "Змінити кінець дня",
  "field.REMINDER_MINUTES": () => "Час нагадувань",
  "edit.REMINDER_MINUTES": () => "Змінити нагадування",
  "field.PLANNING_ACCESS_POLICY": () => "Доступ до планування",
  "edit.PLANNING_ACCESS_POLICY": () => "Змінити доступ до планування",
  "weekday.MON": () => "Пн",
  "weekday.TUE": () => "Вт",
  "weekday.WED": () => "Ср",
  "weekday.THU": () => "Чт",
  "weekday.FRI": () => "Пт",
  "weekday.SAT": () => "Сб",
  "weekday.SUN": () => "Нд",
  "setup.progress": ({ step, prompt }) =>
    `Налаштування триває\nКрок ${step} із 8\n\n${prompt}`,
  "duration.value": ({ minutes }) => formatPlanningDuration("uk", minutes),
  "settings.current": ({ value }) => `Зараз: ${value}`,
  "settings.new": ({ value }) => `Нове значення: ${value}`,
  "settings.row": ({ label, value }) => `${label}: ${value}`,
  "timezone.use": ({ timezone }) => `Обрати ${timezone}`,
  "timezone.candidate": ({ timezone }) =>
    `<b>Часовий пояс знайдено</b>\nВаріант: <code>${timezone}</code>\n\nНадішли іншу геолокацію`,
  "timezone.candidates": ({ candidates }) =>
    `<b>Часовий пояс знайдено</b>\nВаріанти:\n${candidates}\n\nНадішли іншу геолокацію`,
  "roster.added": ({ label }) => `✅ ${label} тепер у складі гурту.`,
  "roster.alreadyActive": ({ label }) => `✅ ${label} уже у складі гурту.`,
  "roster.removeTitle": ({ label }) => `<b>Видалити ${label}?</b>`,
  "roster.fallback": ({ suffix }) => `Користувач Telegram ••••${suffix}`,
  "roster.page": ({ start, end, total }) =>
    `Показано ${start}–${end} із ${total}`,
} satisfies MessageCatalog;
