import { ReactionTestCore } from './ReactionCore.js';

// --- 1. РОЗУМНИЙ МОК ЧАСУ ---
let virtualTime = 0;
let timerIdCounter = 0;
let timers = []; // Зберігаємо всі активні таймери

global.Date.now = () => virtualTime;

global.setTimeout = (callback, delay) => {
    const id = ++timerIdCounter;
    // Запам'ятовуємо, КОЛИ має спрацювати таймер
    timers.push({ id, callback, triggerTime: virtualTime + delay });
    // Сортуємо, щоб першими йшли найближчі події
    timers.sort((a, b) => a.triggerTime - b.triggerTime);
    return id;
};

global.clearTimeout = (idToClear) => {
    timers = timers.filter(t => t.id !== idToClear);
};

// Промотує час вперед і виконує ТІЛЬКИ ті події, час яких настав
function advanceTime(ms) {
    const targetTime = virtualTime + ms;

    while (timers.length > 0) {
        // Дивимось на найближчий таймер
        const nextTimer = timers[0];

        // Якщо його час ще не настав у межах нашого "стрибка" — зупиняємось
        if (nextTimer.triggerTime > targetTime) {
            break;
        }

        // "Проживаємо" час до моменту спрацювання таймера
        virtualTime = nextTimer.triggerTime;
        timers.shift(); // Видаляємо з черги
        nextTimer.callback(); // Виконуємо
    }

    // Доходимо до фінального часу
    virtualTime = targetTime;
}

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        console.log("   Virtual Time:", virtualTime);
        // Виводимо стан таймерів для дебагу
        console.log("   Pending Timers:", timers.map(t => t.triggerTime));
        process.exit(1);
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

// --- 2. ТЕСТИ ---

console.log("--- ЗАПУСК ВИПРАВЛЕНИХ ТЕСТІВ ---");

// ТЕСТ 1: Біологічний вік
const bioRes = ReactionTestCore.calculateBioAge(262.26, 12, 'male');
assert(Math.floor(bioRes.biologicalAge) === 12, "Біологічний вік розраховано правильно");


// ТЕСТ 2: Успішний цикл (з фіксованою експозицією)
const core = new ReactionTestCore({
    stimuliCount: 2,
    minValidReactionTime: 100,
    minDelay: 1000,
    maxDelay: 1000, // Фіксована затримка 1000мс
    exposureTime: 700 // Фіксований час показу
});

let isVisible = false;
core.onStimulusShow = () => { isVisible = true; };
core.onStimulusHide = () => { isVisible = false; };

core.start();
assert(core.state.isRunning === true, "Тест запущено");

// 1. Чекаємо появи (delay 1000ms)
// Промотуємо час на 500мс
advanceTime(500);
assert(isVisible === false, "Стимул ще не показаний (500 < 1000)");

// Промотуємо ще на 500мс (разом 1000) -> має з'явитися
advanceTime(500);
assert(isVisible === true, "Стимул з'явився (час = 1000мс)");

// 2. Реакція користувача
// Промотуємо на 300мс (час реакції)
// Оскільки exposureTime = 700, стимул НЕ повинен зникнути (300 < 700)
advanceTime(300); // virtualTime = 1300
assert(isVisible === true, "Стимул все ще на екрані під час реакції");

// Клікаємо
const result = core.registerInput();
assert(result === true, "Ввід зараховано");
assert(isVisible === true, "Стимул НЕ зник після натискання (чекаємо завершення експозиції)");
assert(core.state.pendingReaction === 300, `Тимчасовий час реакції правильний (${core.state.pendingReaction})`);

// 3. Завершення експозиції
// Ми пройшли 300мс експозиції, залишилось 400мс (700 - 300)
advanceTime(400); // virtualTime = 1700
assert(isVisible === false, "Стимул зник після завершення часу експозиції");
assert(core.state.stimulusResults.length === 1, "Результат перенесено в історію");
assert(core.state.stimulusResults[0] === 300, "Фінальний результат правильний");


// ТЕСТ 3: Пропуск (Timeout)
// Зараз virtualTime = 1700.
// Наступний стимул заплановано через 1000мс після зникнення попереднього.
// Очікувана поява: 1700 + 1000 = 2700.

advanceTime(1000); // virtualTime = 2700
assert(isVisible === true, "Другий стимул з'явився");

// Нічого не робимо весь час експозиції (700мс) + трохи (1мс)
advanceTime(701);
assert(isVisible === false, "Стимул зник сам (час вийшов)");

// Перевіряємо, що результат не записався як валідний час
// (В поточній логіці miss не додається в stimulusResults або додається як null, залежить від реалізації.
// Перевіряємо, що масив не змінився, тобто ми не записали "фейковий" час)
assert(core.state.stimulusResults.length === 1, "Пропущений стимул не вплинув на статистику успішних");


// ТЕСТ 4: Спам
core.resetFullTest();
core.startNextRound(); // Раунд 1
// Час затримки 1000мс -> Стимул
advanceTime(1000);

let spamDetected = false;
core.onSpamDetected = () => { spamDetected = true; };

// 3 дозволених кліки
core.registerInput();
core.registerInput();
core.registerInput();
assert(spamDetected === false, "3 кліки - це ще не спам");

// 4-й клік
core.registerInput();
assert(spamDetected === true, "4-й клік викликав детектор спаму");


console.log("\n🎉 Всі тести пройшли успішно!");