// ===============================================
// 🎮 مدير اللعبة - المنطق الأساسي
// ===============================================

class GameManager {
    constructor() {
        this.rooms = new Map();
        this.leaderboard = new Map();
        this.playerStats = new Map();
        this.pendingInvites = new Map();
        
        console.log('🎮 مدير اللعبة - جاهز');
    }

    // 🏠 إدارة الغرف
    createRoom(player1, player2) {
        const roomId = this.generateRoomId();
        
        const room = {
            id: roomId,
            players: [
                { ...player1, symbol: 'X', ready: false },
                { ...player2, symbol: 'O', ready: false }
            ],
            state: this.initializeGameState(),
            createdAt: Date.now(),
            moves: 0,
            lastActivity: Date.now()
        };

        this.rooms.set(roomId, room);
        console.log(`🆕 غرفة جديدة: ${roomId} - ${player1.name} vs ${player2.name}`);
        
        return room;
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

    // 🎯 معالجة الحركات
    handleMakeMove(playerId, cellIndex) {
        const room = this.findPlayerRoom(playerId);
        if (!room) throw new Error('لاعب ليس في غرفة');

        this.validateMove(room, playerId, cellIndex);

        // تنفيذ الحركة
        room.state.board[cellIndex] = room.state.currentPlayer;
        room.state.moves++;
        room.lastActivity = Date.now();

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

        return room.state;
    }

    validateMove(room, playerId, cellIndex) {
        const player = room.players.find(p => p.id === playerId);
        
        if (!room.state.active) {
            throw new Error('اللعبة غير نشطة');
        }

        if (room.state.currentPlayer !== player.symbol) {
            throw new Error('ليس دورك للعب');
        }

        if (room.state.board[cellIndex] !== null) {
            throw new Error('الخلية مشغولة');
        }

        if (cellIndex < 0 || cellIndex > 8) {
            throw new Error('حركة غير صالحة');
        }
    }

    // 🏆 التحقق من الفوز
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

        // التحقق من التعادل
        if (board.every(cell => cell !== null)) {
            return 'draw';
        }

        return null;
    }

    // 📊 إحصائيات والمتصدرين
    async handleGameCompletion(roomId, winner) {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error('الغرفة غير موجودة');

        const results = {
            players: [],
            stats: {}
        };

        for (let player of room.players) {
            const stats = this.playerStats.get(player.id) || 
                         { wins: 0, losses: 0, draws: 0, totalGames: 0, rating: 1000 };
            
            stats.totalGames++;

            if (winner === 'draw') {
                stats.draws++;
            } else if (winner === player.symbol) {
                stats.wins++;
                stats.rating += 10;
            } else {
                stats.losses++;
                stats.rating = Math.max(800, stats.rating - 10);
            }

            this.playerStats.set(player.id, stats);
            results.players.push({ id: player.id, stats });
        }

        await this.updateLeaderboard();
        return results;
    }

    updateLeaderboard() {
        const sortedPlayers = Array.from(this.playerStats.entries())
            .map(([playerId, stats]) => ({ playerId, ...stats }))
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 10); // أفضل 10 لاعبين

        this.leaderboard = new Map(sortedPlayers.map((player, index) => [player.playerId, player]));
    }

    getLeaderboard() {
        return Array.from(this.leaderboard.values());
    }

    // 🔄 الأدوات المساعدة
    findPlayerRoom(playerId) {
        for (let [roomId, room] of this.rooms) {
            if (room.players.some(player => player.id === playerId)) {
                return room;
            }
        }
        return null;
    }

    generateRoomId() {
        return Math.random().toString(36).substring(2, 10).toUpperCase();
    }

    getRoomCount() {
        return this.rooms.size;
    }

    // 🧹 تنظيف الذاكرة
    cleanupOldRooms() {
        const now = Date.now();
        const MAX_ROOM_AGE = parseInt(process.env.MAX_ROOM_AGE_MS) || 600000; // 10 دقائق

        for (let [roomId, room] of this.rooms) {
            if (now - room.lastActivity > MAX_ROOM_AGE) {
                console.log(`🧹 تنظيف غرفة قديمة: ${roomId}`);
                this.rooms.delete(roomId);
            }
        }
    }

    // 🆕 استعادة حالة اللعبة
    restoreGameState(playerId) {
        const room = this.findPlayerRoom(playerId);
        if (room) {
            return {
                room: room,
                gameState: room.state,
                opponent: room.players.find(p => p.id !== playerId)
            };
        }
        return null;
    }
}

module.exports = GameManager;