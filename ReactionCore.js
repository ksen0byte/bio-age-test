/**
 * REACTION CORE MODULE
 *
 * Модуль чистої бізнес-логіки для тесту реакції.
 * Відповідає за:
 * - Таймінги появи стимулів
 * - Обробку введення (кліків)
 * - Розрахунок статистики
 * - Керування раундами та перервами
 *
 * Не містить жодної логіки відображення (DOM/HTML).
 */

// Таблиця нормативів біологічного віку (Патент №126671)
const BIO_AGE_NORMATIVE_TABLE = {
    male: {7: 357.86, 8: 344.72, 9: 302.67, 10: 295.73, 11: 264.15, 12: 262.26, 13: 248.71, 14: 243.6, 15: 235.9, 16: 231.6},
    female: {7: 387.06, 8: 347.32, 9: 311.79, 10: 304.15, 11: 272.93, 12: 268.74, 13: 256.78, 14: 251.77, 15: 247.3, 16: 239.4}
};

export class ReactionTestCore {
    /**
     * @param {Object} config - Налаштування тесту
     * @param {number} [config.rounds=3] - Кількість серій (раундів) тестування
     * @param {number} [config.stimuliCount=30] - Кількість стимулів в одному раунді
     * @param {number} [config.exposureTime=700] - Час показу стимулу на екрані (мс)
     * @param {number} [config.minDelay=1500] - Мінімальна пауза перед появою (мс)
     * @param {number} [config.maxDelay=3000] - Максимальна пауза перед появою (мс)
     * @param {number} [config.minValidReactionTime=100] - Мінімальний час реакції (захист від випадкових кліків)
     * @param {number} [config.maxSpamClicks=3] - Макс. кількість кліків на один стимул (захист від "спаму")
     */
    constructor(config = {}) {
        this.config = {
            rounds: 3,
            stimuliCount: 30,
            exposureTime: 700,
            minDelay: 1500,
            maxDelay: 3000,
            minValidReactionTime: 100,
            maxSpamClicks: 3,
            ...config
        };

        // Внутрішній стан
        this.state = {
            isRunning: false,           // Чи активний процес тестування
            isRoundActive: false,       // Чи йде зараз раунд (активні стимули)
            currentRound: 0,            // Поточний номер раунду (1-based)
            currentStimulusIndex: 0,    // Поточний номер стимулу в раунді
            stimulusResults: [],        // Результати поточного раунду
            roundAverages: [],          // Середні значення завершених раундів

            // Тимчасові змінні для одного стимулу
            stimulusStartTime: 0,
            isStimulusVisible: false,
            clickCountForStimulus: 0,   // Лічильник кліків для поточного стимулу

            timerId: null
        };

        // --- Події (Callbacks) для зовнішнього коду ---
        this.onStimulusShow = (index, total) => {
        };     // Показати стимул
        this.onStimulusHide = () => {
        };                 // Сховати стимул
        this.onRoundComplete = (roundStats, isFinal) => {
        }; // Раунд завершено
        this.onSpamDetected = () => {
        };                 // Виявлено порушення
    }

    /**
     * Починає тестування з першого раунду.
     */
    start() {
        this.resetFullTest();
        this.startNextRound();
    }

    /**
     * Запускає наступний раунд (наприклад, після перерви).
     */
    startNextRound() {
        if (this.state.currentRound >= this.config.rounds) {
            return; // Всі раунди завершено
        }

        this.state.currentRound++;
        this.state.currentStimulusIndex = 0;
        this.state.stimulusResults = [];
        this.state.isRunning = true;
        this.state.isRoundActive = true;

        this.scheduleNextStimulus();
    }

    /**
     * Повне скидання стану (для рестарту).
     */
    resetFullTest() {
        this.state.roundAverages = [];
        this.state.currentRound = 0;
        this.resetRoundState();
    }

    resetRoundState() {
        this.state.stimulusResults = [];
        this.state.currentStimulusIndex = 0;
        this.state.isRunning = false;
        this.state.isRoundActive = false;
        this.state.isStimulusVisible = false;
        clearTimeout(this.state.timerId);
    }

    /**
     * Планує появу стимулу через випадковий час.
     * @private
     */
    scheduleNextStimulus() {
        if (this.state.currentStimulusIndex >= this.config.stimuliCount) {
            this.finishRound();
            return;
        }

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
        this.state.clickCountForStimulus = 0; // Скидання лічильника спаму

        this.onStimulusShow(this.state.currentStimulusIndex + 1, this.config.stimuliCount);

        // Таймер експозиції (авто-приховування)
        this.state.timerId = setTimeout(() => {
            if (this.state.isStimulusVisible) {
                this.handleNoReaction();
            }
        }, this.config.exposureTime);
    }

    /**
     * Обробляє вхід від користувача (клік/клавіша).
     * @returns {boolean} - true якщо вхід зараховано, false якщо проігноровано
     */
    registerInput() {
        // Ігноруємо, якщо тест не йде або стимул вже зник
        if (!this.state.isRoundActive || !this.state.isStimulusVisible) return false;

        // 1. Захист від спаму (забагато кліків на один стимул)
        this.state.clickCountForStimulus++;
        if (this.state.clickCountForStimulus > this.config.maxSpamClicks) {
            this.handleSpam();
            return false;
        }

        const reactionTime = Date.now() - this.state.stimulusStartTime;

        // 2. Фільтр фізіологічно неможливих реакцій
        if (reactionTime < this.config.minValidReactionTime) {
            return false;
        }

        this.recordResult(reactionTime);
        return true;
    }

    handleSpam() {
        this.state.isRoundActive = false; // Пауза
        clearTimeout(this.state.timerId);
        this.onStimulusHide();
        this.onSpamDetected(); // UI має показати попередження і перезапустити раунд або стимул
    }

    /**
     * Користувач не встиг натиснути.
     * @private
     */
    handleNoReaction() {
        // Можна записувати null (пропуск) або макс. час.
        // Зараз просто ігноруємо пропуск у статистиці або рахуємо як помилку.
        // Для простоти переходимо далі без запису результату.
        this.recordResult(null);
    }

    recordResult(time) {
        this.state.isStimulusVisible = false;
        this.onStimulusHide();

        if (time !== null) {
            this.state.stimulusResults.push(time);
        }

        this.state.currentStimulusIndex++;
        this.scheduleNextStimulus();
    }

    finishRound() {
        this.state.isRoundActive = false;

        // Розрахунок середнього за раунд
        const stats = this.calculateRoundStats();

        if (stats) {
            this.state.roundAverages.push(stats.average);
        } else {
            // Якщо раунд пустий (всі пропуски), додаємо 0 або обробляємо окремо
            this.state.roundAverages.push(0);
        }

        const isFinalRound = this.state.currentRound >= this.config.rounds;

        // Повідомляємо UI, що раунд завершено
        // UI має вирішити: показувати таймер перерви чи фінальний екран
        this.onRoundComplete(stats, isFinalRound);
    }

    calculateRoundStats() {
        const validResults = this.state.stimulusResults;
        if (!validResults.length) return null;

        const sum = validResults.reduce((a, b) => a + b, 0);
        const avg = sum / validResults.length;

        return {
            roundNumber: this.state.currentRound,
            average: Math.round(avg),
            count: validResults.length,
            raw: validResults
        };
    }

    /**
     * Отримати фінальні результати тесту
     */
    getFinalResults() {
        if (!this.state.roundAverages.length) return null;

        // Середнє всіх середніх (або середнє всіх сирих даних - залежить від методики)
        // Тут беремо середнє арифметичне середніх значень раундів
        const grandSum = this.state.roundAverages.reduce((a, b) => a + b, 0);
        const grandAvg = grandSum / this.state.roundAverages.length;

        return {
            grandAverage: Math.round(grandAvg),
            roundAverages: this.state.roundAverages
        };
    }

    // --- STATIC HELPERS ---

    static calculateBioAge(actualMs, age, gender) {
        // Нормалізація віку до діапазону 7-16
        const tableAge = Math.min(Math.max(Math.floor(age), 7), 16);

        // Безпечний доступ до таблиці
        const genderTable = BIO_AGE_NORMATIVE_TABLE[gender] || BIO_AGE_NORMATIVE_TABLE['male'];
        const normMs = genderTable[tableAge];

        if (!normMs) return null;

        const tbr = actualMs / normMs;
        const bioAge = age / tbr;

        let conclusion = "Норма";
        if (tbr < 0.95) conclusion = "Розвиток прискорений (БВ > ПВ)";
        if (tbr > 1.10) conclusion = "Розвиток уповільнений (БВ < ПВ)";

        return {
            chronologicalAge: age,
            biologicalAge: bioAge.toFixed(2),
            tbr: tbr.toFixed(2),
            normMs: normMs,
            conclusion: conclusion
        };
    }
}