const socket = io();
const tg = window.Telegram.WebApp; // Telegram интеграция
let audioContextUnlocked = false;

function unlockAudioContext() {
    if (audioContextUnlocked) return;
    audioContextUnlocked = true;

    const silentAudio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    silentAudio.play().catch(() => {});
    silentAudio.pause();

    console.log('Аудио-контекст разблокирован после клика');
}

document.addEventListener('click', unlockAudioContext, { once: true });
document.addEventListener('touchstart', unlockAudioContext, { once: true });

tg.ready(); // Инициализация Mini App
tg.expand(); // Полноэкранный режим

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
const unlockSoundBtn = document.getElementById('unlock-sound-btn');
let currentRoomId = null;  
let isHost = false;          
let answerTimer = null;
let answerTimeLeft = 0;
const ANSWER_TIMEOUT = 15; 

function resetAnswerButton() {
    answerBtn.disabled = false;
    answerBtn.textContent = 'Ответить';
    answerBtn.style.display = 'block';
    console.log('Кнопка Ответить принудительно сброшена');
}

let audioUnlocked = false;

function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;

    const silentAudio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    silentAudio.play().catch(() => {});
    silentAudio.pause();

    console.log('Аудио-контекст разблокирован');
}

document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('touchstart', unlockAudio, { once: true });

joinBtn.addEventListener('click', () => {
    console.log("Кнопка Присоединиться нажата!");

    let roomId = roomIdInput.value || Math.random().toString(36).substring(7);
    let playerName = playerNameInput.value || 'Игрок ' + Math.floor(Math.random() * 100);

    console.log("Room ID:", roomId, "Имя:", playerName);

    socket.emit('joinRoom', { roomId, playerName });
    currentRoomId = roomId;

    roomSetup.style.display = 'none';
    gameDiv.style.display = 'block';
});

startGameBtn.addEventListener('click', () => {
    if (!isHost) return;

    socket.emit('startGame', currentRoomId);
    startGameBtn.style.display = 'none';
});

socket.on('joined', (data) => {
    updatePlayers(data.players);

    if (data.players.length === 1 && data.players[0].id === socket.id) {
        isHost = true;
        startGameBtn.style.display = 'block';
        console.log("Вы — хост комнаты");
    } else {
        console.log("Вы — обычный игрок");
    }
});

socket.on('updatePlayers', (players) => {
    updatePlayers(players);
});

function updatePlayers(players) {
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    
    playersDiv.innerHTML = '<h3>Лидерборд</h3>';
    sortedPlayers.forEach((p, index) => {
        const rank = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index+1}.`;
        const isCurrent = p.id === socket.id ? ' (вы)' : '';
        playersDiv.innerHTML += `
            <p style="font-size:1.1em; margin:8px 0;">
                ${rank} ${p.name}${isCurrent} — <strong>${p.score}</strong> баллов
            </p>
        `;
    });
    
    if (players.length === 0) {
        playersDiv.innerHTML = '<p>В комнате пока никого...</p>';
    }
}

socket.on('newRound', (data) => {
    console.log('Получен newRound. URL трека:', data.trackSrc);

    if (!data.trackSrc) {
        console.warn('URL трека пустой');
        messagesDiv.innerHTML += '<p style="color:red;">Трек не загружен</p>';
        return;
    }

    audioPlayer.src = data.trackSrc;
    audioPlayer.type = 'audio/mpeg';
    audioPlayer.load(); // перезагружаем с новым типом

    audioPlayer.play()
    .then(() => console.log('Трек запущен'))
    .catch(err => {
        console.error('Ошибка воспроизведения:', err);
        if (err.name === 'NotAllowedError') {
            messagesDiv.innerHTML += '<p style="color:#f39c12; font-weight:bold; margin-top:10px;">Нажми ещё раз по экрану, чтобы включить звук</p>';
        }
    });

    document.getElementById('track-info').innerHTML = 'Слушайте отрывок... 🎵';
    messagesDiv.innerHTML += '<p>Новый раунд начался!</p>';
    answerBtn.disabled = false;
    answerBtn.textContent = 'Ответить';
    answerBtn.classList.add('pulse-active');
});

socket.on('correctAnswer', (data) => {
    console.log('Получено correctAnswer');

    messagesDiv.innerHTML += `<p><strong>${data.playerName || 'Игрок'}</strong> угадал! 🎯</p>`;
    document.getElementById('answer-status').innerHTML = 
        `<span style="color:#27ae60; animation: fadeIn 1s;">+10 баллов!</span> 
         Это был <strong>${data.title || 'Название'}</strong> — <strong>${data.artist || 'Исполнитель'}</strong> 🎉`;

    showScorePopup(10);
    correctSound.currentTime = 0;
    correctSound.play().catch(e => console.log('correct sound error:', e));
    
    resetAnswerButton(); // сбрасываем интерфейс

    setTimeout(() => {
        document.getElementById('track-info').innerHTML = 'Слушайте отрывок... 🎵';
    }, 4000);
});

socket.on('wrongAnswer', (data) => {
    console.log('Получено событие wrongAnswer');
    let msg = data.playerName 
        ? `<p><strong>${data.playerName}</strong> неправильно: ${data.answer}. Ход другим!</p>`
        : `<p>Неправильно: ${data.answer}. Ход другим!</p>`;

    messagesDiv.innerHTML += msg;
    resetAnswerButton(); // возвращаем кнопку всем игрокам
    
    wrongSound.currentTime = 0;
    wrongSound.play().catch(() => {});
    showScorePopup(-5);
});

function showScorePopup(amount) {
    const popup = document.getElementById('score-popup');
    popup.textContent = amount > 0 ? `+${amount}` : amount;
    popup.className = 'score-popup show ' + (amount > 0 ? 'score-positive' : 'score-negative');
    
    setTimeout(() => {
        popup.classList.remove('show');
    }, 1500);
}

socket.on('roundTimeout', () => {
    messagesDiv.innerHTML += '<p>Время вышло! Следующий раунд.</p>';
    audioPlayer.pause();
    resetAnswerButton(); // сбрасываем интерфейс
});

socket.on('gameEnded', (players) => {
    messagesDiv.innerHTML += '<p>Игра окончена! 🏁</p>';
    updatePlayers(players);
    newGameBtn.style.display = 'block'; 
});

newGameBtn.addEventListener('click', () => {
    socket.emit('startGame', currentRoomId); 
    newGameBtn.style.display = 'none';
});

socket.on('gameStarted', () => {
    startGameBtn.style.display = 'none';
    console.log("Игра началась — кнопка старта скрыта");
    soundToggleBtn.style.display = 'block'; // Показываем кнопку звука
});

let isSoundEnabled = true;
const soundToggleBtn = document.getElementById('sound-toggle-btn');

function toggleSound() {
    isSoundEnabled = !isSoundEnabled;

    correctSound.muted = !isSoundEnabled;
    wrongSound.muted = !isSoundEnabled;
    audioPlayer.muted = !isSoundEnabled;

    soundToggleBtn.textContent = isSoundEnabled ? '🔊' : '🔇';
    soundToggleBtn.classList.toggle('muted', !isSoundEnabled);
    console.log('Звук ' + (isSoundEnabled ? 'включён' : 'выключен'));
}

soundToggleBtn.addEventListener('click', toggleSound);
if (gameDiv.style.display !== 'none') {
    soundToggleBtn.style.display = 'block';
}