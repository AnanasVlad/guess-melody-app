const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: '*' } // Для тестов, потом можно ограничить
});

// Статические файлы (frontend, музыка)
app.use(express.static(path.join(__dirname, 'public')));

// Массив треков
const tracks = [
    { 
        id: 1, 
        src: '/music/Оптимист.mp3', 
        correctTitle: 'Оптимист', 
        correctArtist: 'Макс Корж' 
    },
    // добавляй остальные треки сюда
];

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

    // Старт игры (хост)
    socket.on('startGame', (roomId) => {
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
        startNewRound(roomId);

        io.to(roomId).emit('gameStarted');
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

// Функция должна быть ВНЕ io.on('connection')
function startNewRound(roomId) {
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

    room.currentTrack = tracks[Math.floor(Math.random() * tracks.length)];
    room.currentPlayerTurn = null;

    io.to(roomId).emit('newRound', { 
        trackSrc: room.currentTrack.src,
        title: room.currentTrack.correctTitle,
        artist: room.currentTrack.correctArtist
    });

    console.log(`Новый раунд ${room.round} в комнате ${roomId}, трек: ${room.currentTrack.src}`);

    setTimeout(() => {
        if (rooms[roomId] && rooms[roomId].gameState === 'playing' && rooms[roomId].currentPlayerTurn === null) {
            io.to(roomId).emit('roundTimeout');
            setTimeout(() => {
            startNewRound(roomId);
        }, 4000);
    }
}, 30000);
        }

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер на порту ${PORT}`));