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
    male: { 7: 357.86, 8: 344.72, 9: 302.67, 10: 295.73, 11: 264.15, 12: 262.26, 13: 248.71, 14: 243.6, 15: 235.9, 16: 231.6 },
    female: { 7: 387.06, 8: 347.32, 9: 311.79, 10: 304.15, 11: 272.93, 12: 268.74, 13: 256.78, 14: 251.77, 15: 247.3, 16: 239.4 }
};

export class ReactionTestCore {
    /**
     * @param {Object} config - Налаштування тесту
     * @param {number} [config.rounds=3] - Кількість серій (раундів) тестування
     * @param {number} [config.stimuliCount=30] - Кількість стимулів у одному раунді
     * @param {number} [config.exposureTime=700] - Час показу стимулу на екрані (мс). Стимул не зникає раніше цього часу.
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
            allRounds: [],              // Зберігає повну деталізацію кожного раунду

            // Тимчасові змінні для одного стимулу
            stimulusStartTime: 0,
            isStimulusVisible: false,
            clickCountForStimulus: 0,   // Лічильник кліків для поточного стимулу
            pendingReaction: null,      // Збережена реакція для поточного стимулу (якщо клік був під час експозиції)

            timerId: null
        };

        // --- Події (Callbacks) для зовнішнього коду ---
        this.onStimulusShow = (index, total) => {};     // Показати стимул
        this.onStimulusHide = () => {};                 // Сховати стимул
        this.onRoundComplete = (roundStats, isFinal) => {}; // Раунд завершено
        this.onSpamDetected = () => {};                 // Виявлено порушення
    }

    /**
     * Логування подій ядра з часовою міткою
     * @private
     */
    log(message) {
        const time = new Date().toISOString().split('T')[1].slice(0, -1);
        console.log(`[Core ${time}] ${message}`);
    }

    /**
     * Починає тестування з першого раунду.
     */
    start() {
        this.log("Starting full test sequence");
        this.resetFullTest();
        this.startNextRound();
    }

    /**
     * Запускає наступний раунд (наприклад, після перерви).
     */
    startNextRound() {
        if (this.state.currentRound >= this.config.rounds) {
            this.log("All rounds finished. Stopping.");
            return;
        }

        this.state.currentRound++;
        this.log(`Starting Round ${this.state.currentRound} of ${this.config.rounds}`);

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
        this.log("Resetting full test state");
        this.state.roundAverages = [];
        this.state.allRounds = [];
        this.state.currentRound = 0;
        this.resetRoundState();
    }

    resetRoundState() {
        this.state.stimulusResults = [];
        this.state.currentStimulusIndex = 0;
        this.state.isRunning = false;
        this.state.isRoundActive = false;
        this.state.isStimulusVisible = false;
        this.state.pendingReaction = null;
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
        this.log(`Scheduling stimulus #${this.state.currentStimulusIndex + 1} in ${delay}ms`);

        this.state.timerId = setTimeout(() => {
            this.showStimulus();
        }, delay);
    }

    /**
     * Показує стимул і запускає таймер експозиції.
     * Стимул буде видно рівно config.exposureTime мс.
     * @private
     */
    showStimulus() {
        this.state.isStimulusVisible = true;
        this.state.stimulusStartTime = Date.now();
        this.state.clickCountForStimulus = 0; // Скидання лічильника спаму
        this.state.pendingReaction = null;    // Скидання попередньої реакції

        this.log(`Showing stimulus #${this.state.currentStimulusIndex + 1}`);
        this.onStimulusShow(this.state.currentStimulusIndex + 1, this.config.stimuliCount);

        // Таймер експозиції: стимул зникне ТІЛЬКИ коли цей таймер спрацює
        this.state.timerId = setTimeout(() => {
            this.finishExposure();
        }, this.config.exposureTime);
    }

    /**
     * Викликається автоматично після завершення часу експозиції (700мс).
     * @private
     */
    finishExposure() {
        this.log(`Exposure finished for stimulus #${this.state.currentStimulusIndex + 1}`);

        this.state.isStimulusVisible = false;
        this.onStimulusHide();

        // Перевіряємо, чи була реакція протягом експозиції
        if (this.state.pendingReaction !== null) {
            this.log(`Result committed: ${this.state.pendingReaction}ms`);
            this.state.stimulusResults.push(this.state.pendingReaction);
        } else {
            this.log("Result: Miss (No reaction)");
            // Можна додати null у результати, якщо потрібно рахувати пропуски:
            // this.state.stimulusResults.push(null);
        }

        this.state.currentStimulusIndex++;
        this.scheduleNextStimulus();
    }

    /**
     * Обробляє вхід від користувача (клік/клавіша).
     * @returns {boolean} - true якщо вхід валідний (навіть якщо просто збережений), false якщо проігноровано
     */
    registerInput() {
        // Ігноруємо, якщо стимул не видно або раунд не активний
        if (!this.state.isRoundActive || !this.state.isStimulusVisible) {
            this.log("Input ignored: Stimulus not visible or round inactive");
            return false;
        }

        // 1. Захист від спаму
        this.state.clickCountForStimulus++;
        if (this.state.clickCountForStimulus > this.config.maxSpamClicks) {
            this.log("Spam detected! Stopping round.");
            this.handleSpam();
            return false;
        }

        // Якщо користувач вже успішно натиснув на цей стимул, ігноруємо повторні кліки
        if (this.state.pendingReaction !== null) {
            this.log("Input ignored: Already reacted to this stimulus");
            return false;
        }

        const reactionTime = Date.now() - this.state.stimulusStartTime;

        // 2. Фільтр надшвидких реакцій
        if (reactionTime < this.config.minValidReactionTime) {
            this.log(`Input ignored: Too fast (${reactionTime}ms)`);
            return false;
        }

        // ВАЖЛИВО: Ми не ховаємо стимул тут! Ми просто запам'ятовуємо час.
        // Стимул зникне тільки у finishExposure().
        this.state.pendingReaction = reactionTime;
        this.log(`Input accepted: ${reactionTime}ms (Waiting for exposure end)`);

        return true;
    }

    handleSpam() {
        this.state.isRoundActive = false;
        clearTimeout(this.state.timerId); // Зупиняємо таймер експозиції
        this.onStimulusHide();
        this.onSpamDetected();
    }

    finishRound() {
        this.log(`Round ${this.state.currentRound} finished`);
        this.state.isRoundActive = false;

        const stats = this.calculateRoundStats();

        if (stats) {
            this.state.roundAverages.push(stats.average);
            this.state.allRounds.push(stats);
        } else {
            this.state.roundAverages.push(0);
            // Пустий раунд
            this.state.allRounds.push({
                roundNumber: this.state.currentRound,
                average: 0,
                count: 0,
                raw: []
            });
        }

        const isFinalRound = this.state.currentRound >= this.config.rounds;
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

    getFinalResults() {
        if (!this.state.roundAverages.length) return null;

        const grandSum = this.state.roundAverages.reduce((a, b) => a + b, 0);
        const grandAvg = grandSum / this.state.roundAverages.length;

        this.log(`Test finished. Grand Average: ${grandAvg}`);

        return {
            grandAverage: Math.round(grandAvg),
            roundAverages: this.state.roundAverages,
            roundsDetails: this.state.allRounds
        };
    }

    /**
     * Resets the CURRENT round to 0 and starts it over.
     */
    retryCurrentRound() {
        this.log(`Retrying Round ${this.state.currentRound}`);
        this.resetRoundState(); // Clears results/index for this round
        this.state.isRunning = true;
        this.state.isRoundActive = true;
        this.scheduleNextStimulus();
    }

    // --- STATIC HELPERS ---

    static calculateBioAge(actualMs, age, gender) {
        const tableAge = Math.min(Math.max(Math.floor(age), 7), 16);
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
