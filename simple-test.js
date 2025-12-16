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
        // Виводимо стан для дебагу
        console.log("   Virtual Time:", virtualTime);
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


// ТЕСТ 2: Успішний цикл
const core = new ReactionTestCore({
    stimuliCount: 2,
    minValidReactionTime: 100,
    minDelay: 1000,
    maxDelay: 1000, // Фіксована затримка 1000мс для передбачуваності
    exposureTime: 700
});

let isVisible = false;
core.onStimulusShow = () => { isVisible = true; };
core.onStimulusHide = () => { isVisible = false; };

core.start();
assert(core.state.isRunning === true, "Тест запущено");

// Промотуємо час на 500мс (менше затримки 1000)
advanceTime(500);
assert(isVisible === false, "Стимул ще не показаний (500мс < 1000мс)");

// Промотуємо ще на 500мс (разом 1000) -> має з'явитися
advanceTime(500);
assert(isVisible === true, "Стимул з'явився (час = 1000мс)");

// Промотуємо на 300мс (час реакції)
// Оскільки exposureTime = 700, стимул НЕ повинен зникнути (300 < 700)
advanceTime(300);
assert(isVisible === true, "Стимул все ще на екрані під час реакції");

// Клікаємо
const result = core.registerInput();
assert(result === true, "Ввід зараховано");
assert(isVisible === false, "Стимул зник ПІСЛЯ натискання");
assert(core.state.stimulusResults[0] === 300, `Час реакції правильний (${core.state.stimulusResults[0]} === 300)`);


// ТЕСТ 3: Пропуск (Timeout)
// Зараз час 1300. Наступний стимул заплановано через 1000мс (на 2300).
advanceTime(1000);
assert(isVisible === true, "Другий стимул з'явився (час = 2300)");

// Нічого не робимо 800мс (більше за exposure 700мс)
advanceTime(800);
assert(isVisible === false, "Стимул зник сам (час вийшов)");
// Перевіряємо, що результат не записався (або записався як null/пропуск, залежить від реалізації)
// У вашій поточній реалізації null не додається в stimulusResults, тому довжина масиву має залишитись 1
assert(core.state.stimulusResults.length === 1, "Пропущений стимул не вплинув на статистику успішних");


// ТЕСТ 4: Спам
core.resetFullTest();
core.startNextRound(); // Раунд 1
// Час 1000 (delay) -> Стимул
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