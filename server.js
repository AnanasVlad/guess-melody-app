require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });
const publicUrl = `https://storage.yandexcloud.net/${BUCKET_NAME}/${encodeURIComponent(selectedTrack.path)}`;
io.to(roomId).emit('newRound', { trackSrc: publicUrl });

app.use(express.static(path.join(__dirname, 'public')));

const s3Client = new S3Client({
    region: 'ru-central1',
    endpoint: 'https://storage.yandexcloud.net',
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY
    }
});
const BUCKET_NAME = 'guess-melody-tracks';

let tracks = [
    { id: 1, path: 'Оптимист.mp3', correctTitle: 'Оптимист', correctArtist: 'Макс Корж' },
    { id: 2, path: 'Алиса.mp3', correctTitle: 'Алиса', correctArtist: 'Мукка' },
    { id: 3, path: 'Выхода нет.mp3', correctTitle: 'Выхода нет', correctArtist: 'Сплин' },
    { id: 4, path: 'Знаешь ли ты.mp3', correctTitle: 'Знаешь ли ты', correctArtist: 'Максим' },
    { id: 5, path: 'Олимп.mp3', correctTitle: 'Олимп', correctArtist: 'Даник' },
    { id: 6, path: 'Отпускай.mp3', correctTitle: 'Отпускай', correctArtist: 'Три дня дождя' },
    { id: 7, path: 'Перезарежай.mp3', correctTitle: 'Перезарежай', correctArtist: 'Три дня дождя' },
    { id: 8, path: 'Последня любовь.mp3', correctTitle: 'Последняя любовь', correctArtist: 'Моргенштерн' },
    { id: 9, path: 'Приснится.mp3', correctTitle: 'Приснится', correctArtist: 'Даник' },
    { id: 10, path: 'Нон стоп.mp3', correctTitle: 'Нон стоп', correctArtist: 'Пошлая Молли' },
    // Добавь 100+ объектов, аналогично: { id: 2, path: 'track2.mp3', correctTitle: '...', correctArtist: '...' }
    // ...];
]

// Функция загрузки списка треков из бакета
async function loadTracksFromBucket() {
    try {
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            // Prefix: 'music/'  // если все треки в подпапке music/
        });

        const response = await s3Client.send(command);

        tracks = (response.Contents || [])
            .filter(obj => obj.Key.endsWith('.mp3'))
            .map((obj, index) => ({
                id: index + 1,
                path: obj.Key,
                correctTitle: obj.Key.replace('.mp3', '').split(' - ')[1] || obj.Key.replace('.mp3', ''),
                correctArtist: obj.Key.replace('.mp3', '').split(' - ')[0] || 'Неизвестен'
            }));

        console.log(`Загружено ${tracks.length} треков из Yandex Cloud`);
    } catch (err) {
        console.error('Ошибка загрузки списка треков из Yandex:', err);
    }
}

// Вызываем при запуске сервера
loadTracksFromBucket();
// Комнаты
const rooms = {};

io.on('connection', (socket) => {
    console.log('Игрок подключен:', socket.id);

    // Присоединиться к комнате
    socket.on('joinRoom', (data) => {
        const { roomId, playerName } = data;
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], currentTrack: null, currentPlayerTurn: null, gameState: 'waiting', round: 0 };
        }
        const player = { id: socket.id, name: playerName, score: 0 };
        rooms[roomId].players.push(player);
        io.to(roomId).emit('updatePlayers', rooms[roomId].players);
        socket.emit('joined', { roomId, players: rooms[roomId].players });
    });

    socket.on('startGame', async (roomId) => {  // ← добавь async
    const room = rooms[roomId];
    if (!room) {
        console.log(`Попытка старта несуществующей комнаты: ${roomId}`);
        return;
    }
    if (room.gameState !== 'waiting') {
        console.log(`Попытка старта комнаты не в состоянии waiting: ${roomId} (${room.gameState})`);
        return;
    }

    room.gameState = 'playing';
    room.round = 0;

    io.to(roomId).emit('gameStarted');  // сразу говорим клиентам, что игра началась

    // Запускаем первый раунд асинхронно
    await startNewRound(roomId);  // ← await здесь!
});

    // Запрос на ответ (кто быстрее нажал)
    socket.on('requestAnswer', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        if (room.currentPlayerTurn !== null) return; // уже занят
        if (room.gameState !== 'playing') return;

        room.currentPlayerTurn = socket.id;
        io.to(roomId).emit('turnAssigned', { playerId: socket.id });
        socket.emit('yourTurn');
    });

    // Таймаут ответа
    socket.on('answerTimeout', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.currentPlayerTurn !== socket.id) return;

        const player = room.players.find(p => p.id === socket.id);
        io.to(roomId).emit('wrongAnswer', {
            playerId: socket.id,
            playerName: player ? player.name : 'Игрок',
            answer: '(время вышло)'
        });

        room.currentPlayerTurn = null;
        io.to(roomId).emit('updatePlayers', room.players);
    });

    // Отправка ответа
 socket.on('submitAnswer', (data) => {
    const { roomId, answer } = data;
    const room = rooms[roomId];
    if (!room || room.currentPlayerTurn !== socket.id) return;

    const track = room.currentTrack;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const isCorrect = answer.toLowerCase().includes(track.correctTitle.toLowerCase()) ||
                      answer.toLowerCase().includes(track.correctArtist.toLowerCase());

    if (isCorrect) {
        player.score += 10;
        io.to(roomId).emit('correctAnswer', {
            playerId: socket.id,
            playerName: player.name,
            answer,
            title: track.correctTitle,
            artist: track.correctArtist
        });
        io.to(roomId).emit('updatePlayers', room.players);

        // Пауза 4 секунды перед следующим раундом
        setTimeout(() => {
            startNewRound(roomId);
        }, 4000);
    } else {
        player.score -= 5;
        room.currentPlayerTurn = null;

        io.to(roomId).emit('wrongAnswer', {
            playerId: socket.id,
            playerName: player.name,
            answer
        });
        io.to(roomId).emit('updatePlayers', room.players);
        // Здесь паузы нет — ход сразу свободен для следующего игрока
    }
});

    // Отключение игрока
    socket.on('disconnect', () => {
        for (let roomId in rooms) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            io.to(roomId).emit('updatePlayers', rooms[roomId].players);
            if (rooms[roomId].players.length === 0) delete rooms[roomId];
        }
        console.log('Игрок отключен:', socket.id);
    });
});

async function startNewRound(roomId) {
    const room = rooms[roomId];
    
    if (!room || room.gameState !== 'playing') {
        console.log(`Попытка начать раунд в несуществующей/неготовой комнате: ${roomId}`);
        return;
    }

    room.round = (room.round || 0) + 1;

    if (room.round > 10) {
        room.gameState = 'ended';
        io.to(roomId).emit('gameEnded', room.players);
        return;
    }

    if (tracks.length === 0) {
        console.warn('Нет треков для раунда');
        io.to(roomId).emit('newRound', { trackSrc: '/music/fallback.mp3' });
        return;
    }

    const selectedTrack = tracks[Math.floor(Math.random() * tracks.length)];

    console.log(`Генерация signed URL для трека: ${selectedTrack.path}`);

    try {
        // Создаём команду GetObject
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: selectedTrack.path
        });

        // Генерируем подписанную ссылку (1 час действия)
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

        room.currentTrack = { ...selectedTrack, src: signedUrl };

        io.to(roomId).emit('newRound', { trackSrc: signedUrl });

        console.log(`Signed URL успешно сгенерирован и отправлен клиентам для трека ${selectedTrack.path}`);
    } catch (err) {
        console.error('Ошибка или таймаут при генерации URL для трека', selectedTrack.path, ':', err.message || err);

        // Fallback на локальный файл (если есть)
        io.to(roomId).emit('newRound', { trackSrc: '/music/fallback.mp3' });
    }

    // Таймер на раунд 30 секунд
    setTimeout(() => {
        if (rooms[roomId] && rooms[roomId].gameState === 'playing' && rooms[roomId].currentPlayerTurn === null) {
            io.to(roomId).emit('roundTimeout');
            startNewRound(roomId);
        }
    }, 30000);
}
        

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер на порту ${PORT}`));