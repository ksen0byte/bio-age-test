/**
 * REACTION CORE MODULE
 * Чиста бізнес-логіка тесту без HTML/CSS.
 * Відповідає за таймінги, стани та обробку результатів.
 */

// Таблиця нормативів (ізольована константа)
const BIO_AGE_NORMATIVE_TABLE = {
    male: {7: 357.86, 8: 344.72, 9: 302.67, 10: 295.73, 11: 264.15, 12: 262.26, 13: 248.71, 14: 243.6, 15: 235.9, 16: 231.6},
    female: {7: 387.06, 8: 347.32, 9: 311.79, 10: 304.15, 11: 272.93, 12: 268.74, 13: 256.78, 14: 251.77, 15: 247.3, 16: 239.4}
};

export class ReactionTestCore {
    /**
     * Створює екземпляр тесту.
     * @param {Object} config - Об'єкт налаштувань.
     * @param {number} [config.stimuliCount=30] - Кількість спроб у тесті.
     * @param {number} [config.exposureTime=700] - Час показу стимулу (мс).
     * @param {number} [config.minDelay=750] - Мінімальна затримка перед появою (мс).
     * @param {number} [config.maxDelay=1250] - Максимальна затримка перед появою (мс).
     * @param {number} [config.minValidReactionTime=100] - Поріг для фільтрації випадкових/надшвидких кліків (мс).
     * @param {number} [config.maxSpamClicks=3] - Максимальна кількість кліків на один стимул до зупинки тесту (захист від спаму).
     */
    constructor(config = {}) {
        // Дефолтні налаштування з можливістю перезапису
        this.config = {
            stimuliCount: 30,
            exposureTime: 700,
            minDelay: 750,
            maxDelay: 1250,
            minValidReactionTime: 100,
            maxSpamClicks: 3,
            ...config
        };

        // Внутрішній стан
        this.state = {
            isRunning: false,           // Чи активний тест зараз
            currentStimulusIndex: 0,    // Номер поточного стимулу (0-based)
            results: [],                // Масив збережених результатів (мс)
            stimulusStartTime: 0,       // Час появи останнього стимулу (timestamp)
            isStimulusVisible: false,   // Чи видно стимул прямо зараз
            currentSpamCount: 0,        // Лічильник кліків для поточного стимулу
            timerId: null               // ID таймера для очистки
        };

        // --- Події (Callbacks) ---
        // Викликається, коли треба показати стимул
        this.onStimulusShow = (index) => {
        };

        // Викликається, коли стимул зникає (успіх або таймаут)
        this.onStimulusHide = () => {
        };

        // Викликається при завершенні всіх спроб
        this.onTestComplete = (stats) => {
        };

        // Викликається, якщо виявлено підозрілу активність (спам кнопкою)
        this.onSpamDetected = () => {
        };
    }

    /**
     * Запускає тест з початку.
     */
    start() {
        this.reset();
        this.state.isRunning = true;
        this.scheduleNextStimulus();
    }

    /**
     * Скидає стан тесту до початкового.
     * Зупиняє всі таймери.
     */
    reset() {
        this.state.results = [];
        this.state.currentStimulusIndex = 0;
        this.state.isRunning = false;
        this.state.isStimulusVisible = false;
        this.state.currentSpamCount = 0;
        clearTimeout(this.state.timerId);
    }

    /**
     * Планує появу наступного стимулу через випадковий проміжок часу.
     * @private
     */
    scheduleNextStimulus() {
        if (this.state.currentStimulusIndex >= this.config.stimuliCount) {
            this.finish();
            return;
        }

        // Розрахунок випадкової затримки в межах minDelay та maxDelay
        const delay = Math.floor(Math.random() * (this.config.maxDelay - this.config.minDelay) + this.config.minDelay);

        this.state.timerId = setTimeout(() => {
            this.showStimulus();
        }, delay);
    }

    /**
     * Показує стимул і запускає таймер експозиції.
     * @private
     */
    showStimulus() {
        this.state.isStimulusVisible = true;
        this.state.stimulusStartTime = Date.now();
        this.state.currentSpamCount = 0; // Скидаємо лічильник спаму для нового стимулу

        this.onStimulusShow(this.state.currentStimulusIndex + 1);

        // Таймер експозиції: якщо користувач не натисне, стимул зникне сам
        this.state.timerId = setTimeout(() => {
            if (this.state.isStimulusVisible) {
                this.handleNoReaction(); // Час вийшов
            }
        }, this.config.exposureTime);
    }

    /**
     * Обробляє вхід від користувача (клік, натискання клавіші).
     * Має бути викликаний із UI (наприклад, з обробника 'mousedown' або 'keydown').
     */
    registerInput() {
        if (!this.state.isRunning) return;

        // 1. Перевірка на спам (чи не забагато кліків на один стимул)
        this.state.currentSpamCount++;
        if (this.state.currentSpamCount > this.config.maxSpamClicks) {
            this.state.isRunning = false;
            clearTimeout(this.state.timerId);
            this.onSpamDetected(); // Повідомляємо UI про порушення
            return;
        }

        // Якщо стимул не видно (фальстарт), ігноруємо (але лічильник спаму вже інкрементовано)
        if (!this.state.isStimulusVisible) return;

        const reactionTime = Date.now() - this.state.stimulusStartTime;

        // 2. Фільтр "надшвидких" реакцій (фізіологічно неможливих)
        if (reactionTime < this.config.minValidReactionTime) return;

        // Успішна реакція
        this.recordResult(reactionTime);
    }

    /**
     * Обробляє ситуацію, коли користувач не встиг натиснути під час експозиції.
     * @private
     */
    handleNoReaction() {
        // Записуємо null як ознаку пропуску
        this.recordResult(null);
    }

    /**
     * Зберігає результат спроби і переходить до наступного кроку.
     * @param {number|null} time - Час реакції в мс або null.
     * @private
     */
    recordResult(time) {
        this.state.isStimulusVisible = false;
        this.onStimulusHide(); // Ховаємо стимул в UI

        // Додаємо результат, якщо це не пропуск (опціонально можна зберігати і null)
        if (time !== null) {
            this.state.results.push(time);
        }

        this.state.currentStimulusIndex++;

        // Запускаємо цикл заново
        this.scheduleNextStimulus();
    }

    /**
     * Завершує тест і формує статистику.
     * @private
     */
    finish() {
        this.state.isRunning = false;
        const stats = this.calculateStats();
        this.onTestComplete(stats);
    }

    /**
     * Розраховує статистику на основі збережених результатів.
     * @returns {Object|null} Об'єкт зі статистикою (середнє, кількість) або null.
     */
    calculateStats() {
        const validResults = this.state.results;
        if (!validResults.length) return null;

        const sum = validResults.reduce((a, b) => a + b, 0);
        const avg = sum / validResults.length;

        return {
            average: Math.round(avg),
            count: validResults.length,
            raw: validResults
        };
    }

    /**
     * Статичний метод для розрахунку біологічного віку (Pure Function).
     * Використовує таблицю нормативів.
     * * @param {number} actualMs - Середній час реакції (фактичний).
     * @param {number} age - Хронологічний вік (паспортний).
     * @param {string} gender - Стать ('male' | 'female').
     * @returns {Object|null} Результат розрахунку або null, якщо вхідні дані некоректні.
     */
    static calculateBioAge(actualMs, age, gender) {
        // Нормалізація віку до меж таблиці (7-16)
        const tableAge = Math.min(Math.max(Math.floor(age), 7), 16);

        if (!BIO_AGE_NORMATIVE_TABLE[gender]) return null;
        const normMs = BIO_AGE_NORMATIVE_TABLE[gender][tableAge];

        if (!normMs) return null;

        const tbr = actualMs / normMs; // Темп біологічного розвитку (ТБР)
        const bioAge = age / tbr;      // Біологічний вік (БВ)

        return {
            chronologicalAge: age,
            biologicalAge: bioAge.toFixed(2),
            tbr: tbr.toFixed(2),
            normMs: normMs,
            conclusion: tbr < 0.95 ? "Прискорений" : (tbr > 1.1 ? "Уповільнений" : "Норма")
        };
    }
}