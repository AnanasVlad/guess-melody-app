require('dotenv').config();  // ← это НЕ надо в client (script.js) — удали эту строку!

const socket = io();
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Глобальные переменные
let currentRoomId = null;
let isHost = false;
let answerTimer = null;
let answerTimeLeft = 0;
const ANSWER_TIMEOUT = 15;
let isSoundEnabled = true;
let audioUnlocked = false;

// Элементы DOM
const roomSetup = document.getElementById('room-setup');
const gameDiv = document.getElementById('game');
const roomIdInput = document.getElementById('room-id');
const playerNameInput = document.getElementById('player-name');
const joinBtn = document.getElementById('join-btn');
const startGameBtn = document.getElementById('start-game-btn');
const audioPlayer = document.getElementById('audio-player');
const answerBtn = document.getElementById('answer-btn');
const answerForm = document.getElementById('answer-form');
const answerInput = document.getElementById('answer-input');
const submitAnswer = document.getElementById('submit-answer');
const playersDiv = document.getElementById('players');
const messagesDiv = document.getElementById('messages');
const correctSound = document.getElementById('correct-sound');
const wrongSound = document.getElementById('wrong-sound');
const newGameBtn = document.getElementById('new-game-btn');
const soundToggleBtn = document.getElementById('sound-toggle-btn');

// Разблокировка автоплея при первом взаимодействии
function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;

    const silent = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    silent.play().catch(() => {});
    silent.pause();

    console.log('Аудио-контекст разблокирован');
}

document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('touchstart', unlockAudio, { once: true });

// Переключение звука
function toggleSound() {
    isSoundEnabled = !isSoundEnabled;

    if (isSoundEnabled) {
        soundToggleBtn.textContent = '🔊';
        soundToggleBtn.style.background = 'rgba(39,174,96,0.9)';
        correctSound.muted = false;
        wrongSound.muted = false;
        audioPlayer.muted = false;
    } else {
        soundToggleBtn.textContent = '🔇';
        soundToggleBtn.style.background = 'rgba(231,76,60,0.9)';
        correctSound.muted = true;
        wrongSound.muted = true;
        audioPlayer.muted = true;
    }
}

soundToggleBtn.addEventListener('click', toggleSound);

// Показываем иконку звука после старта игры
socket.on('gameStarted', () => {
    soundToggleBtn.style.display = 'block';
});

// Генерация roomId
joinBtn.addEventListener('click', () => {
    let roomId = roomIdInput.value || Math.random().toString(36).substring(7);
    let playerName = playerNameInput.value || 'Игрок ' + Math.floor(Math.random() * 100);

    socket.emit('joinRoom', { roomId, playerName });
    currentRoomId = roomId;

    roomSetup.style.display = 'none';
    gameDiv.style.display = 'block';
});

// Старт игры
startGameBtn.addEventListener('click', () => {
    if (!isHost) return;
    socket.emit('startGame', currentRoomId);
    startGameBtn.style.display = 'none';
});

// Хост определяется после join
socket.on('joined', (data) => {
    updatePlayers(data.players);
    if (data.players.length === 1 && data.players[0].id === socket.id) {
        isHost = true;
        startGameBtn.style.display = 'block';
    }
});

// Обновление игроков
socket.on('updatePlayers', updatePlayers);

function updatePlayers(players) {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    playersDiv.innerHTML = '<h3>Лидерборд</h3>';
    sorted.forEach((p, i) => {
        const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
        playersDiv.innerHTML += `<p>${rank} ${p.name}${p.id === socket.id ? ' (вы)' : ''} — <strong>${p.score}</strong></p>`;
    });
}

// Новый раунд
socket.on('newRound', (data) => {
    console.log('New round, track URL:', data.trackSrc);

    if (!data.trackSrc) {
        messagesDiv.innerHTML += '<p style="color:red;">Трек не загружен</p>';
        return;
    }

    audioPlayer.src = data.trackSrc;
    audioPlayer.type = 'audio/mpeg';
    audioPlayer.load();

    // Пытаемся автоплей
    audioPlayer.play()
        .then(() => console.log('Трек запущен'))
        .catch(err => {
            console.error('Play error:', err);
            soundToggleBtn.style.display = 'block'; // показываем иконку
        });

    answerBtn.style.display = 'block';
    answerBtn.disabled = false;
    answerBtn.textContent = 'Ответить';
    answerBtn.classList.add('pulse-active');

    answerForm.style.display = 'none';
    document.getElementById('track-info').innerHTML = 'Слушайте отрывок... 🎵';
    messagesDiv.innerHTML += '<p>Новый раунд начался!</p>';
});

// Правильный ответ
socket.on('correctAnswer', (data) => {
    messagesDiv.innerHTML += `<p><strong>${data.playerName || 'Игрок'}</strong> угадал! 🎯</p>`;
    document.getElementById('answer-status').innerHTML = `+10 баллов! Это был <strong>${data.title}</strong> — <strong>${data.artist}</strong> 🎉`;

    showScorePopup(10);

    correctSound.currentTime = 0;
    correctSound.play().catch(() => {});

    // Сброс кнопки
    answerBtn.disabled = false;
    answerBtn.textContent = 'Ответить';
    answerBtn.style.display = 'block';
    answerBtn.classList.add('pulse-active');

    setTimeout(() => {
        document.getElementById('answer-status').innerHTML = '';
        document.getElementById('track-info').innerHTML = 'Слушайте отрывок... 🎵';
    }, 4000);
});

// Неправильный ответ
socket.on('wrongAnswer', (data) => {
    messagesDiv.innerHTML += `<p>${data.playerName || 'Игрок'} неправильно: ${data.answer}. Ход другим!</p>`;

    wrongSound.currentTime = 0;
    wrongSound.play().catch(() => {});

    showScorePopup(-5);

    answerBtn.disabled = false;
    answerBtn.textContent = 'Ответить';
    answerBtn.style.display = 'block';
    answerBtn.classList.add('pulse-active');
});

// Таймаут раунда
socket.on('roundTimeout', () => {
    messagesDiv.innerHTML += '<p>Время вышло! Следующий раунд.</p>';
    audioPlayer.pause();

    answerBtn.disabled = false;
    answerBtn.textContent = 'Ответить';
    answerBtn.style.display = 'block';
    answerBtn.classList.add('pulse-active');
});

// Конец игры
socket.on('gameEnded', (players) => {
    messagesDiv.innerHTML += '<p>Игра окончена! 🏁</p>';
    updatePlayers(players);
    newGameBtn.style.display = 'block';
});

// Новая игра
newGameBtn.addEventListener('click', () => {
    socket.emit('startGame', currentRoomId);
    newGameBtn.style.display = 'none';
});

// Остальные обработчики (join, turnAssigned, yourTurn и т.д.) оставь как были

// Функция всплывающих баллов (оставь как есть)
function showScorePopup(amount) {
    const popup = document.getElementById('score-popup');
    popup.textContent = amount > 0 ? `+${amount}` : amount;
    popup.className = 'score-popup show ' + (amount > 0 ? 'score-positive' : 'score-negative');
    setTimeout(() => popup.classList.remove('show'), 1500);
}