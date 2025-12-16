import { ReactionTestCore } from './ReactionCore.js';

// Налаштування (можна винести в окремий файл або json)
const CONFIG = {
    rounds: 3,
    stimuliCount: 30,
    exposureTime: 700,
    minDelay: 750,
    maxDelay: 1250,
    minValidReactionTime: 100,
    maxSpamClicks: 3,
    breakDuration: 120
};

export default function reactionApp() {
    return {
        // --- STATE (Реактивні дані) ---
        screen: 'login', // 'login', 'instruction', 'test', 'break', 'result'

        // Дані користувача
        user: { name: '', age: '', gender: 'male' },

        // Стан тесту (для відображення)
        round: 1,
        totalRounds: CONFIG.rounds,
        stimulusIndex: 0,
        totalStimuli: CONFIG.stimuliCount,
        isStimulusVisible: false,
        timerDisplay: '00:00',

        // Результати
        results: null,
        bioAge: null,

        // Внутрішні посилання
        core: null,
        breakInterval: null,

        // --- INIT ---
        init() {
            // Ініціалізуємо ядро з конфігом
            this.core = new ReactionTestCore(CONFIG);

            // --- ПІДПИСКА НА ПОДІЇ ЯДРА (Binding) ---
            // Коли ядро каже "покажи стимул" -> ми оновлюємо змінні Alpine

            this.core.onStimulusShow = (index, total) => {
                this.stimulusIndex = index;
                this.isStimulusVisible = true;
            };

            this.core.onStimulusHide = () => {
                this.isStimulusVisible = false;
            };

            this.core.onSpamDetected = () => {
                alert("⚠️ Не поспішайте! Натискайте тільки коли бачите квадрат.");
                // Відновлюємо роботу ядра
                this.core.state.isRunning = true;
                this.core.scheduleNextStimulus();
            };

            this.core.onRoundComplete = (stats, isFinal) => {
                if (isFinal) {
                    this.finishTest();
                } else {
                    this.startBreak();
                }
            };
        },

        // --- ACTIONS (Методи, що викликаються з HTML) ---

        login() {
            if (this.user.age < 7 || this.user.age > 16) {
                if(!confirm("Методика розрахована на 7-16 років. Продовжити?")) return;
            }
            this.core.resetFullTest(); // Скидаємо ядро
            this.setupRoundView();
        },

        startRound() {
            this.screen = 'test';
            this.core.startNextRound();
        },

        handleInput() {
            // Передаємо клік у ядро. Воно саме вирішить, чи це валідний клік, чи спам.
            this.core.registerInput();
        },

        skipBreak() {
            clearInterval(this.breakInterval);
            this.setupRoundView();
        },

        restart() {
            this.screen = 'login';
            this.user = { name: '', age: '', gender: 'male' };
        },

        // --- PRIVATE HELPERS ---

        setupRoundView() {
            // Синхронізуємо номер раунду з ядром (+1 для відображення)
            this.round = this.core.state.currentRound + 1;
            this.screen = 'instruction';
        },

        startBreak() {
            this.screen = 'break';
            let seconds = CONFIG.breakDuration;
            this.updateTimerStr(seconds);

            this.breakInterval = setInterval(() => {
                seconds--;
                this.updateTimerStr(seconds);
                if (seconds <= 0) {
                    this.skipBreak();
                }
            }, 1000);
        },

        updateTimerStr(sec) {
            const m = Math.floor(sec / 60).toString().padStart(2, '0');
            const s = (sec % 60).toString().padStart(2, '0');
            this.timerDisplay = `${m}:${s}`;
        },

        finishTest() {
            const rawResults = this.core.getFinalResults();

            // Використовуємо статичну чисту функцію ядра для розрахунку
            this.bioAge = ReactionTestCore.calculateBioAge(
                rawResults.grandAverage,
                Number(this.user.age),
                this.user.gender
            );

            this.results = rawResults;
            this.screen = 'result';
        }
    };
}