// ===============================================
// 🚀 XO Game Server - النسخة المبسطة والموثوقة
// ===============================================

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

class XOGameServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            },
            pingTimeout: 60000,
            pingInterval: 25000
        });

        // تهيئة الحالة
        this.players = new Map();
        this.rooms = new Map();
        this.lobbyPlayers = new Set();
        this.playerInvites = new Map();

        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
        
        console.log('🎮 خادم XO - جاهز للتشغيل');
    }

    setupMiddleware() {
        // 📦 خدم الملفات الثابتة
        this.app.use(express.static(path.join(__dirname, 'public')));
        
        // 📝 تحقق من حجم البيانات
        this.app.use(express.json({ limit: '10kb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10kb' }));
        
        console.log('🔧 الإعدادات - مكتملة');
    }

    setupRoutes() {
        // 🏠 الصفحة الرئيسية
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // ❤️ صفحة الصحة
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'OK',
                players: this.players.size,
                rooms: this.rooms.size,
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            });
        });
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`🔗 لاعب متصل: ${socket.id}`);
            
            // 👤 أحداث اللاعب
            socket.on('joinLobby', (data) => this.handleJoinLobby(socket, data));
            socket.on('sendInvite', (data) => this.handleSendInvite(socket, data));
            socket.on('acceptInvite', (data) => this.handleAcceptInvite(socket, data));

            // 🎮 أحداث اللعبة
            socket.on('makeMove', (data) => this.handleMakeMove(socket, data));
            socket.on('requestRestart', () => this.handleRequestRestart(socket));
            socket.on('playerReady', () => this.handlePlayerReady(socket));
            socket.on('leaveRoom', () => this.handleLeaveRoom(socket));

            // 🔄 أحداث النظام
            socket.on('getLobbyUpdate', () => this.handleLobbyUpdate(socket));
            socket.on('getLeaderboard', () => this.handleGetLeaderboard(socket));
            socket.on('ping', (callback) => callback('pong'));

            // 🚪 أحداث الانفصال
            socket.on('disconnect', (reason) => this.handleDisconnect(socket, reason));
        });
    }

    // 👤 معالجة أحداث اللاعبين
    async handleJoinLobby(socket, data) {
        try {
            if (!this.validatePlayerName(data.playerName)) {
                socket.emit('error', { message: 'اسم اللاعب غير صالح' });
                return;
            }

            const player = {
                id: socket.id,
                name: data.playerName.trim(),
                socket: socket,
                status: 'available',
                joinedAt: Date.now()
            };

            this.players.set(socket.id, player);
            this.lobbyPlayers.add(socket.id);

            socket.emit('lobbyJoined', {
                playerName: player.name,
                leaderboard: this.getLeaderboard()
            });

            this.broadcastLobbyUpdate();
            
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    }

    async handleSendInvite(socket, data) {
        try {
            const sender = this.players.get(socket.id);
            const target = this.players.get(data.targetId);

            if (!sender || !target) {
                socket.emit('error', { message: 'اللاعب غير موجود' });
                return;
            }

            if (sender.status !== 'available' || target.status !== 'available') {
                socket.emit('error', { message: 'اللاعب غير متاح' });
                return;
            }

            // إرسال الدعوة
            target.socket.emit('inviteReceived', {
                inviterId: sender.id,
                inviterName: sender.name
            });

            socket.emit('inviteSent', { targetName: target.name });
            
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    }

    async handleAcceptInvite(socket, data) {
        try {
            const acceptor = this.players.get(socket.id);
            const sender = this.players.get(data.inviterId);

            if (!acceptor || !sender) {
                socket.emit('error', { message: 'اللاعب غير موجود' });
                return;
            }

            // إنشاء غرفة جديدة
            const roomId = this.generateRoomId();
            const room = {
                id: roomId,
                players: [
                    { ...sender, symbol: 'X' },
                    { ...acceptor, symbol: 'O' }
                ],
                state: this.initializeGameState(),
                createdAt: Date.now()
            };

            this.rooms.set(roomId, room);
            sender.status = 'in_game';
            acceptor.status = 'in_game';

            // انضمام اللاعبين للغرفة
            sender.socket.join(roomId);
            acceptor.socket.join(roomId);

            // إشعار اللاعبين ببدء اللعبة
            this.io.to(roomId).emit('gameStarted', {
                room: room,
                players: room.players,
                mySymbol: room.players.find(p => p.id === socket.id)?.symbol
            });

            this.broadcastLobbyUpdate();
            
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    }

    // 🎮 معالجة أحداث اللعبة
    async handleMakeMove(socket, data) {
        try {
            const room = this.findPlayerRoom(socket.id);
            if (!room) {
                socket.emit('error', { message: 'اللاعب ليس في غرفة' });
                return;
            }

            const player = room.players.find(p => p.id === socket.id);
            if (!player) {
                socket.emit('error', { message: 'اللاعب ليس في هذه الغرفة' });
                return;
            }

            // التحقق من صحة الحركة
            if (!this.validateMove(room, player, data.cellIndex)) {
                socket.emit('error', { message: 'حركة غير صالحة' });
                return;
            }

            // تنفيذ الحركة
            room.state.board[data.cellIndex] = room.state.currentPlayer;
            room.state.moves++;

            // التحقق من الفوز
            const winner = this.checkWinner(room.state.board);
            if (winner) {
                room.state.winner = winner;
                room.state.active = false;
                room.state.message = winner === 'draw' ? 'تعادل!' : `فاز ${winner}!`;
            } else {
                // تبديل اللاعب
                room.state.currentPlayer = room.state.currentPlayer === 'X' ? 'O' : 'X';
                room.state.message = `دور اللاعب ${room.state.currentPlayer}`;
            }

            // إرسال تحديث اللعبة للغرفة
            this.io.to(room.id).emit('gameStateUpdated', {
                state: room.state
            });
            
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    }

    // 🔧 الأدوات المساعدة
    validatePlayerName(name) {
        if (!name || typeof name !== 'string') return false;
        if (name.length < 2 || name.length > 20) return false;
        const validPattern = /^[\p{L}\p{N}\s_-]+$/u;
        return validPattern.test(name);
    }

    validateMove(room, player, cellIndex) {
        if (!room.state.active) return false;
        if (room.state.currentPlayer !== player.symbol) return false;
        if (room.state.board[cellIndex] !== null) return false;
        if (cellIndex < 0 || cellIndex > 8) return false;
        return true;
    }

    checkWinner(board) {
        const lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // صفوف
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // أعمدة
            [0, 4, 8], [2, 4, 6]             // أقطار
        ];

        for (let line of lines) {
            const [a, b, c] = line;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return board[a];
            }
        }

        if (board.every(cell => cell !== null)) {
            return 'draw';
        }

        return null;
    }

    initializeGameState() {
        return {
            board: Array(9).fill(null),
            currentPlayer: 'X',
            winner: null,
            isDraw: false,
            active: true,
            moves: 0,
            message: 'اللاعب X يبدأ'
        };
    }

    findPlayerRoom(playerId) {
        for (let room of this.rooms.values()) {
            if (room.players.some(player => player.id === playerId)) {
                return room;
            }
        }
        return null;
    }

    generateRoomId() {
        return Math.random().toString(36).substring(2, 10).toUpperCase();
    }

    getLeaderboard() {
        return []; // يمكن تطوير هذا لاحقاً
    }

    // 🔄 معالجة الأحداث العامة
    handleLobbyUpdate(socket) {
        const lobbyData = {
            players: this.getLobbyPlayers()
        };
        socket.emit('lobbyUpdated', lobbyData);
    }

    handleGetLeaderboard(socket) {
        socket.emit('leaderboardData', {
            leaderboard: this.getLeaderboard()
        });
    }

    getLobbyPlayers() {
        return Array.from(this.lobbyPlayers)
            .map(playerId => {
                const player = this.players.get(playerId);
                return player ? {
                    id: player.id,
                    name: player.name,
                    status: player.status
                } : null;
            })
            .filter(player => player !== null);
    }

    // 🚪 معالجة الانفصال
    async handleDisconnect(socket, reason) {
        console.log(`🚪 لاعب انقطع: ${socket.id}`);
        
        const player = this.players.get(socket.id);
        if (player) {
            this.players.delete(socket.id);
            this.lobbyPlayers.delete(socket.id);
            
            // إذا كان في غرفة، معالجة مغادرته
            const room = this.findPlayerRoom(socket.id);
            if (room) {
                this.handlePlayerLeaveRoom(room, socket.id);
            }
        }

        this.broadcastLobbyUpdate();
    }

    handlePlayerLeaveRoom(room, playerId) {
        room.players = room.players.filter(p => p.id !== playerId);
        
        if (room.players.length === 0) {
            this.rooms.delete(room.id);
        } else {
            // إشعار اللاعب المتبقي
            const remainingPlayer = room.players[0];
            remainingPlayer.socket.emit('opponentLeft', {
                message: 'غادر الخصم الغرفة'
            });
        }
    }

    // 📢 بث التحديثات
    broadcastLobbyUpdate() {
        const lobbyData = {
            players: this.getLobbyPlayers()
        };
        this.io.emit('lobbyUpdated', lobbyData);
    }

    // معالجات أخرى مبسطة
    handleRequestRestart(socket) {
        socket.emit('error', { message: 'لم يتم تطوير هذه الميزة بعد' });
    }

    handlePlayerReady(socket) {
        socket.emit('error', { message: 'لم يتم تطوير هذه الميزة بعد' });
    }

    handleLeaveRoom(socket) {
        const room = this.findPlayerRoom(socket.id);
        if (room) {
            this.handlePlayerLeaveRoom(room, socket.id);
        }
        socket.emit('lobbyJoined', { playerName: this.players.get(socket.id)?.name });
    }

    // 🚀 تشغيل السيرفر
    start() {
        const PORT = process.env.PORT || 3000;
        const HOST = '0.0.0.0';

        this.server.listen(PORT, HOST, () => {
            console.log('🎮 خادم XO يعمل على PORT:', PORT);
            console.log('🌐 العنوان:', `http://localhost:${PORT}`);
        });
    }
}

// تشغيل السيرفر
const gameServer = new XOGameServer();
gameServer.start();