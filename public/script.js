const socket = io();
const tg = window.Telegram.WebApp; // Telegram интеграция
let audioContextUnlocked = false;

function unlockAudioContext() {
    if (audioContextUnlocked) return;
    audioContextUnlocked = true;

    // Создаём "пустой" звук для разблокировки аудио-контекста
    const silentAudio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    silentAudio.play().catch(() => {});
    silentAudio.pause();

    console.log('Аудио-контекст разблокирован после клика');
}

// Разблокируем при первом клике/тапе по странице
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
let currentRoomId = null;   // ← вот эту строку добавляем
let isHost = false;          // будем устанавливать true только для первого игрока
let answerTimer = null;
let answerTimeLeft = 0;
const ANSWER_TIMEOUT = 15; // секунд на ответ
// Для дебага — можно вызвать в консоли браузера: resetAnswerButton()
function resetAnswerButton() {
    answerBtn.disabled = false;
    answerBtn.textContent = 'Ответить';
    answerBtn.style.display = 'block';
    console.log('Кнопка Ответить принудительно сброшена');
}
let audioUnlocked = false;

// Функция разблокировки
function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;

    // Создаём "пустой" клик по аудио, чтобы разблокировать
    const silentAudio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    silentAudio.play().catch(() => {});
    silentAudio.pause();

    console.log('Аудио-контекст разблокирован');
}

// Разблокируем при первом клике/тапе по странице
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('touchstart', unlockAudio, { once: true });

// Генерация roomId если пусто
joinBtn.addEventListener('click', () => {
    console.log("Кнопка Присоединиться нажата!");

    let roomId = roomIdInput.value || Math.random().toString(36).substring(7);
    let playerName = playerNameInput.value || 'Игрок ' + Math.floor(Math.random() * 100);

    console.log("Room ID:", roomId, "Имя:", playerName);

    socket.emit('joinRoom', { roomId, playerName });
    currentRoomId = roomId;

    roomSetup.style.display = 'none';
    gameDiv.style.display = 'block';

    // Пока не знаем, хост ли мы — кнопку НЕ показываем
    // startGameBtn.style.display = 'block';   ← ЭТУ СТРОКУ ЗАКОММЕНТИРУЙ или УДАЛИ
});

startGameBtn.addEventListener('click', () => {
    if (!isHost) return; // на всякий случай

    socket.emit('startGame', currentRoomId);

    // Сразу скрываем кнопку у себя
    startGameBtn.style.display = 'none';
});

socket.on('joined', (data) => {
    updatePlayers(data.players);

    // Проверяем: если мы первый в списке игроков → мы хост
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

// Когда начинается новый раунд
socket.on('newRound', (data) => {
    console.log('Получен newRound. URL трека:', data.trackSrc);  // ← лог URL
    audioPlayer.play().catch(() => {
        unlockSoundBtn.style.display = 'block';
        unlockSoundBtn.addEventListener('click', () => {
    audioPlayer.play().catch(() => {});
    unlockSoundBtn.style.display = 'none';
});
    });
    if (!data.trackSrc) {
        console.warn('URL трека пустой');
        messagesDiv.innerHTML += '<p style="color:red;">Трек не загружен</p>';
        return;
    }

    audioPlayer.src = data.trackSrc;
    console.log('Установлен src аудио:', audioPlayer.src);

   audioPlayer.play()
    .then(() => console.log('Трек запущен'))
    .catch(err => {
        console.error('Ошибка воспроизведения:', err);
        if (err.name === 'NotAllowedError') {
            messagesDiv.innerHTML += '<p style="color:#f39c12; font-weight:bold; margin-top:10px;">Нажми ещё раз по экрану, чтобы включить звук</p>';
        }
    });

    answerBtn.style.display = 'block';
    answerForm.style.display = 'none';
    document.getElementById('track-info').innerHTML = 'Слушайте отрывок... 🎵';
    messagesDiv.innerHTML += '<p>Новый раунд начался!</p>';
});

// После правильного ответа — показываем трек
socket.on('correctAnswer', (data) => {
    // ... существующий код ...
    
    // Предполагаем, что сервер пришлёт correctTitle и correctArtist
    // Если пока не присылает — используем заглушку или доработаем сервер
    document.getElementById('track-info').innerHTML = 
        `Это был <strong>${data.title || 'Название'}</strong> — <strong>${data.artist || 'Исполнитель'}</strong> 🎉`;
});

answerBtn.addEventListener('click', () => {
    unlockAudioContext();  // разблокируем
    if (!currentRoomId) return;
    socket.emit('requestAnswer', currentRoomId);
    // сразу блокируем кнопку у себя (на всякий случай)
    answerBtn.disabled = true;
    answerBtn.textContent = "Ожидание...";
});

socket.on('turnAssigned', (data) => {
    if (data.playerId !== socket.id) {
        answerBtn.style.display = 'none';   
        answerBtn.classList.remove('pulse-active');            // или оставь 'block' + disabled
      
        
        answerForm.style.display = 'none';
        document.getElementById('timer').style.display = 'none';
        if (answerTimer) clearInterval(answerTimer);
        messagesDiv.innerHTML += '<p>Кто-то другой отвечает...</p>';
    }
});

socket.on('yourTurn', () => {
    if (answerTimer) clearInterval(answerTimer);  // на всякий случай
    answerBtn.style.display = 'none';
    answerForm.style.display = 'block';
    answerBtn.disabled = false; // на всякий случай, если где-то застряло
    answerBtn.classList.remove('pulse-active'); // убираем пульсацию у себя, т.к. теперь отвечаешь

    // Запускаем таймер
    answerTimeLeft = ANSWER_TIMEOUT;
    document.getElementById('time-left').textContent = answerTimeLeft;
    
    // Прогресс-бар начинается с 100%
    const progressBar = document.getElementById('progress-bar');
    progressBar.style.width = '100%';
    progressBar.style.background = '#e74c3c'; // зелёный → жёлтый → красный можно позже
    
    document.getElementById('timer').style.display = 'block';
    
    answerTimer = setInterval(() => {
        answerTimeLeft--;
        document.getElementById('time-left').textContent = answerTimeLeft;
        
        // Прогресс в процентах
        const progressPercent = (answerTimeLeft / ANSWER_TIMEOUT) * 100;
        progressBar.style.width = `${progressPercent}%`;
        
        // Можно менять цвет по мере уменьшения (опционально)
        if (progressPercent <= 30) {
            progressBar.style.background = '#c0392b'; // тёмно-красный
        } else if (progressPercent <= 60) {
            progressBar.style.background = '#f39c12'; // оранжевый
        }
        
        if (answerTimeLeft <= 0) {
            clearInterval(answerTimer);
            document.getElementById('timer').style.display = 'none';
            answerForm.style.display = 'none';
            messagesDiv.innerHTML += '<p style="color:#e67e22;">Время на ответ вышло!</p>';
            
            socket.emit('answerTimeout', currentRoomId);
        }
    }, 1000);
});

submitAnswer.addEventListener('click', () => {
    if (!currentRoomId) return;

    const answer = answerInput.value.trim();
    if (!answer) return; // не отправляем пустой ответ

    socket.emit('submitAnswer', { roomId: currentRoomId, answer });

    // Очищаем поле и скрываем форму
    answerForm.style.display = 'none';
    answerInput.value = '';

    // Опционально: сразу блокируем кнопку у себя, пока сервер не ответит
    answerBtn.disabled = true;
    answerBtn.textContent = 'Ожидание ответа...';
});

// Правильный ответ
socket.on('correctAnswer', (data) => {
    console.log('Получено correctAnswer');

    messagesDiv.innerHTML += `<p><strong>${data.playerName || 'Игрок'}</strong> угадал! 🎯</p>`;

    document.getElementById('answer-status').innerHTML = 
        `<span style="color:#27ae60; animation: fadeIn 1s;">+10 баллов!</span> 
         Это был <strong>${data.title}</strong> — <strong>${data.artist}</strong> 🎉`;

    showScorePopup(10);

    // Текст о паузе
    document.getElementById('track-info').innerHTML = 
        `Это был <strong>${data.title}</strong> — <strong>${data.artist}</strong><br>
         <span style="color:#f39c12; font-size:1.1em;">Следующий раунд через 4 секунды...</span>`;

    // Звук (только один раз!)
    correctSound.currentTime = 0;
    correctSound.play().catch(e => console.log('correct sound error:', e));

    // Сброс интерфейса
    answerBtn.disabled = false;
    answerBtn.textContent = 'Ответить';
    answerBtn.style.display = 'block';

    answerForm.style.display = 'none';
    document.getElementById('timer').style.display = 'none';

    if (answerTimer) {
        clearInterval(answerTimer);
        answerTimer = null;
        document.getElementById('progress-bar').style.width = '100%';
        document.getElementById('progress-bar').style.background = '#e74c3c';
    }

    // Через 4 секунды текст вернётся в "Слушайте отрывок..." (на всякий случай)
    setTimeout(() => {
        document.getElementById('track-info').innerHTML = 'Слушайте отрывок... 🎵';
    }, 4000);

    // Убрал дублирующий play() и лишний if (audioUnlocked)
});

// Неправильный ответ или таймаут
socket.on('wrongAnswer', (data) => {
    // data: { playerId, playerName, answer }
    console.log('Получено событие correctAnswer / wrongAnswer — сбрасываем кнопку');
    let msg = data.playerName 
        ? `<p><strong>${data.playerName}</strong> неправильно: ${data.answer}. Ход другим!</p>`
        : `<p>Неправильно: ${data.answer}. Ход другим!</p>`;

    messagesDiv.innerHTML += msg;

    // Самое важное — возвращаем кнопку всем игрокам, т.к. ход снова свободен
    answerBtn.disabled = false;
    answerBtn.textContent = 'Ответить';
    answerBtn.style.display = 'block';
    answerBtn.classList.add('pulse-active');
    answerForm.style.display = 'none';
    document.getElementById('timer').style.display = 'none';

    wrongSound.currentTime = 0;
    wrongSound.play().catch(() => {});

    if (answerTimer) {
        clearInterval(answerTimer);
        answerTimer = null;
        document.getElementById('progress-bar').style.width = '100%';
        document.getElementById('progress-bar').style.background = '#e74c3c';
    }
    showScorePopup(-5);
    if (audioUnlocked) {
     wrongSound.currentTime = 0;
     wrongSound.play().catch(e => console.log('Не удалось проиграть correct:', e));
} else {
    console.log('Аудио ещё не разблокировано');
}
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
    answerBtn.disabled = false;
    answerBtn.textContent = 'Ответить';
    answerBtn.style.display = 'block';
    
    if (answerTimer) {
        clearInterval(answerTimer);
        document.getElementById('timer').style.display = 'none';
        document.getElementById('progress-bar').style.width = '100%';
        document.getElementById('progress-bar').style.background = '#e74c3c';
        document.getElementById('track-info').innerHTML += '<br><span style="color:#f39c12; font-size:1.1em;">Следующий раунд через 4 секунды...</span>';
    }
});
    setTimeout(() => {
    document.getElementById('track-info').innerHTML = 'Слушайте отрывок... 🎵';
}, 4000);
socket.on('gameEnded', (players) => {
    messagesDiv.innerHTML += '<p>Игра окончена! 🏁</p>';
    updatePlayers(players);
    newGameBtn.style.display = 'block'; // покажем только хосту или всем
});

newGameBtn.addEventListener('click', () => {
    socket.emit('startGame', currentRoomId); // перезапуск
    newGameBtn.style.display = 'none';
});

socket.on('gameStarted', () => {
    startGameBtn.style.display = 'none';
    console.log("Игра началась — кнопка старта скрыта");
});
