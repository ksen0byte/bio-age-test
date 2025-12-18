import {ReactionTestCore} from './ReactionCore.js';
import { db } from './db.js';

// Налаштування (можна винести в окремий файл або json)
const CONFIG = {
    rounds: 3,
    stimuliCount: 30,
    exposureTime: 700,
    minDelay: 750,
    maxDelay: 1250,
    minValidReactionTime: 100,
    maxSpamClicks: 3,
    breakDuration: 120,
    debug: false,
};

export default function reactionApp() {
    return {
        // --- STATE (Реактивні дані) ---
        screen: 'login', // 'login', 'instruction', 'test', 'break', 'result'
        history: [],

        // Дані користувача
        user: {name: '', age: '', gender: 'male'},

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

        debug: CONFIG.debug,

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
                // Switch to a blocking screen. The Space bar won't work here
                // because handleInput checks for the 'test' screen.
                this.screen = 'spam-error';
            };

            this.core.onRoundComplete = async (stats, isFinal) => {
                if (isFinal) {
                    await this.finishTest();
                } else {
                    this.startBreak();
                }
            };
        },

        // --- ACTIONS (Методи, що викликаються з HTML) ---

        login() {
            if (this.user.age < 7 || this.user.age > 16) {
                if (!confirm("Методика розрахована на 7-16 років. Продовжити?")) return;
            }
            this.core.resetFullTest(); // Скидаємо ядро
            this.setupRoundView();
        },

        startRound() {
            this.screen = 'test';
            this.core.startNextRound();
        },

        handleInput() {
            if (this.screen === 'test') {
                // Передаємо клік у ядро. Воно саме вирішить, чи це валідний клік, чи спам.
                this.core.registerInput();
            }
        },

        skipBreak() {
            clearInterval(this.breakInterval);
            this.setupRoundView();
        },

        restart() {
            this.screen = 'login';
            this.user = {name: '', age: '', gender: 'male'};
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

        async finishTest() {
            const rawResults = this.core.getFinalResults();

            // Використовуємо статичну чисту функцію ядра для розрахунку
            this.bioAge = ReactionTestCore.calculateBioAge(
                rawResults.grandAverage,
                Number(this.user.age),
                this.user.gender
            );

            this.results = rawResults;
            // Ми створюємо "глибоку копію" даних, щоб прибрати Proxy від Alpine.js
            // Це робить дані "чистими" для IndexedDB
            const cleanRecord = JSON.parse(JSON.stringify({
                user: this.user,
                results: this.results,
                bioAge: this.bioAge,
                date: new Date() // Дату краще генерувати тут або в db.js
            }));

            try {
                await db.save(cleanRecord);
                console.log("Результат успішно збережено!");
            } catch (e) {
                console.error("Помилка збереження:", e);
                alert("Не вдалося зберегти результат в історію.");
            }

            this.screen = 'result';
        },

        async showHistory() {
            const data = await db.getAll();
            this.history = data.reverse(); // Нові зверху
            this.screen = 'history';
        },

        async deleteRecord(id) {
            if(confirm('Видалити?')) {
                await db.delete(id);
                await this.showHistory(); // Оновити список
            }
        },

        // Додайте кнопку "Назад" для історії
        goHome() {
            this.screen = 'login';
        },

        retryRound() {
            this.screen = 'test';
            this.core.retryCurrentRound();
        },

        quitTest() {
            if (this.screen === 'login') return;
            if (confirm("Вийти з тестування?")) {
                this.core.resetFullTest();
                this.restart();
            }
        },

        async exportData() {
            // 1. Отримуємо всі дані з БД
            const data = await db.getAll();

            if (!data || data.length === 0) {
                alert("Немає даних для експорту.");
                return;
            }

            // 2. Перетворюємо в красивий JSON рядок
            const jsonString = JSON.stringify(data, null, 2);

            // 3. Створюємо "віртуальний файл" (Blob)
            const blob = new Blob([jsonString], { type: "application/json" });

            // 4. Створюємо посилання для скачування
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');

            // Генеруємо ім'я файлу з датою: "reaction_dump_2023-10-27.json"
            const dateStr = new Date().toISOString().split('T').join('-');
            a.href = url;
            a.download = `reaction_dump_${dateStr}.json`;

            // 5. Клікаємо програмно і прибираємо сміття
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },
    };
}