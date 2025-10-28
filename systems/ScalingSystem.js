// ===============================================
// 📈 نظام التوسع - إدارة الأحمال الكبيرة
// ===============================================

class ScalingSystem {
    constructor() {
        this.servers = new Map();
        this.loadBalancer = new LoadBalancer();
        this.performanceMetrics = new Map();
        this.serverCapacity = parseInt(process.env.SERVER_CAPACITY) || 1000;
        
        console.log('📈 نظام التوسع - جاهز');
    }

    // 🏗️ إضافة سيرفر جديد
    async addServer(serverConfig) {
        const serverId = this.generateServerId();
        
        const server = {
            id: serverId,
            ...serverConfig,
            players: 0,
            rooms: 0,
            load: 0,
            status: 'active',
            joinedAt: Date.now(),
            lastHealthCheck: Date.now()
        };

        this.servers.set(serverId, server);
        
        console.log(`🆕 سيرفر مضاف: ${serverId} - ${server.url}`);
        
        return server;
    }

    // 🎯 توزيع اللاعبين
    async assignPlayerToServer(playerData) {
        const bestServer = await this.findOptimalServer();
        
        if (!bestServer) {
            throw new Error('لا توجد سيرفرات متاحة');
        }

        // تحديث إحصائيات السيرفر
        this.updateServerLoad(bestServer.id, 'player_joined');
        
        return {
            server: bestServer,
            connectionUrl: bestServer.url,
            assignedAt: Date.now()
        };
    }

    // 🔍 إيجاد أفضل سيرفر
    async findOptimalServer() {
        const activeServers = Array.from(this.servers.values())
            .filter(server => server.status === 'active')
            .filter(server => this.isServerHealthy(server));

        if (activeServers.length === 0) {
            return null;
        }

        // استراتيجية التوزيع: أقل سيرفر تحميلاً
        return activeServers.reduce((best, current) => {
            const bestLoad = this.calculateServerLoad(best);
            const currentLoad = this.calculateServerLoad(current);
            return currentLoad < bestLoad ? current : best;
        });
    }

    // 📊 حساب حمل السيرفر
    calculateServerLoad(server) {
        const playerLoad = server.players / this.serverCapacity;
        const roomLoad = server.rooms / (this.serverCapacity / 2);
        const memoryLoad = server.memoryUsage || 0;
        
        return (playerLoad * 0.5) + (roomLoad * 0.3) + (memoryLoad * 0.2);
    }

    // ❤️ فحص صحة السيرفر
    isServerHealthy(server) {
        const timeSinceCheck = Date.now() - server.lastHealthCheck;
        return timeSinceCheck < 30000; // 30 ثانية
    }

    // 📡 تحديث حالة السيرفر
    updateServerLoad(serverId, action) {
        const server = this.servers.get(serverId);
        if (!server) return;

        switch (action) {
            case 'player_joined':
                server.players++;
                break;
            case 'player_left':
                server.players = Math.max(0, server.players - 1);
                break;
            case 'room_created':
                server.rooms++;
                break;
            case 'room_deleted':
                server.rooms = Math.max(0, server.rooms - 1);
                break;
        }

        server.load = this.calculateServerLoad(server);
        server.lastUpdate = Date.now();
    }

    // 🚨 مراقبة الأداء
    async monitorPerformance() {
        const report = {
            timestamp: new Date().toISOString(),
            totalServers: this.servers.size,
            activeServers: Array.from(this.servers.values()).filter(s => s.status === 'active').length,
            totalPlayers: this.getTotalPlayers(),
            totalRooms: this.getTotalRooms(),
            averageLoad: this.getAverageLoad(),
            criticalServers: this.getCriticalServers()
        };

        // حفظ التقرير
        this.performanceMetrics.set(report.timestamp, report);
        
        // التحقق من الحاجة للتوسع
        await this.checkScalingNeeds(report);
        
        return report;
    }

    // 📈 التحقق من الحاجة للتوسع
    async checkScalingNeeds(performanceReport) {
        const averageLoad = performanceReport.averageLoad;
        
        if (averageLoad > 0.8) {
            // حمل عالي - إضافة سيرفرات
            console.log('📈 حمل عالي - جاري إضافة سيرفرات...');
            await this.scaleUp();
        } else if (averageLoad < 0.3 && performanceReport.totalServers > 1) {
            // حمل منخفض - تقليل سيرفرات
            console.log('📉 حمل منخفض - جاري تقليل السيرفرات...');
            await this.scaleDown();
        }
    }

    // ⬆️ التوسع الرأسي
    async scaleUp() {
        const newServerConfig = {
            url: await this.generateServerUrl(),
            capacity: this.serverCapacity,
            region: 'auto'
        };

        try {
            const newServer = await this.addServer(newServerConfig);
            console.log(`⬆️  تمت إضافة سيرفر جديد: ${newServer.id}`);
            
            // 🆕 إشعار نظام الموازنة
            this.loadBalancer.addServer(newServer);
            
        } catch (error) {
            console.error('❌ فشل في إضافة سيرفر:', error);
        }
    }

    // ⬇️ تقليل السيرفرات
    async scaleDown() {
        const serversByLoad = Array.from(this.servers.values())
            .filter(server => server.status === 'active')
            .sort((a, b) => a.load - b.load);

        // إزالة السيرفرات الأقل تحميلاً
        const serversToRemove = serversByLoad.slice(0, Math.floor(serversByLoad.length * 0.2));
        
        for (let server of serversToRemove) {
            await this.removeServer(server.id);
        }
    }

    // 🗑️ إزالة سيرفر
    async removeServer(serverId) {
        const server = this.servers.get(serverId);
        if (!server) return;

        // نقل اللاعبين لسيرفرات أخرى
        await this.migratePlayers(serverId);
        
        // تحديث الحالة
        server.status = 'inactive';
        server.removedAt = Date.now();
        
        console.log(`🗑️  سيرفر مزال: ${serverId}`);
    }

    // 🔄 نقل اللاعبين
    async migratePlayers(fromServerId) {
        const playersToMigrate = this.getPlayersOnServer(fromServerId);
        
        console.log(`🔄 نقل ${playersToMigrate.length} لاعب من السيرفر ${fromServerId}`);
        
        for (let player of playersToMigrate) {
            try {
                await this.migratePlayer(player, fromServerId);
            } catch (error) {
                console.error(`❌ فشل في نقل اللاعب ${player.id}:`, error);
            }
        }
    }

    // 🔧 أدوات مساعدة
    getTotalPlayers() {
        return Array.from(this.servers.values())
            .reduce((total, server) => total + server.players, 0);
    }

    getTotalRooms() {
        return Array.from(this.servers.values())
            .reduce((total, server) => total + server.rooms, 0);
    }

    getAverageLoad() {
        const activeServers = Array.from(this.servers.values())
            .filter(server => server.status === 'active');
        
        if (activeServers.length === 0) return 0;
        
        const totalLoad = activeServers.reduce((sum, server) => sum + server.load, 0);
        return totalLoad / activeServers.length;
    }

    getCriticalServers() {
        return Array.from(this.servers.values())
            .filter(server => server.load > 0.9)
            .map(server => ({
                id: server.id,
                load: server.load,
                players: server.players
            }));
    }

    generateServerId() {
        return `srv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    async generateServerUrl() {
        // 🆕 في الواقع، هذا سيتصل بمزود السحابة
        const baseUrl = process.env.BASE_SERVER_URL || 'https://server';
        const id = this.generateServerId();
        return `${baseUrl}-${id}.yourdomain.com`;
    }

    getPlayersOnServer(serverId) {
        // 🆕 في الواقع، هذا سيجلب البيانات من قاعدة البيانات
        return [];
    }

    async migratePlayer(player, fromServerId) {
        // 🆕 تنفيذ نقل اللاعب
        console.log(`🔀 نقل اللاعب ${player.id} من ${fromServerId}`);
    }
}

// 🎯 موزع الحمل
class LoadBalancer {
    constructor() {
        this.servers = new Map();
        this.strategy = 'least_connections';
    }

    addServer(server) {
        this.servers.set(server.id, {
            ...server,
            connections: 0,
            responseTimes: []
        });
    }

    getBestServer() {
        const servers = Array.from(this.servers.values())
            .filter(server => server.status === 'active');

        switch (this.strategy) {
            case 'least_connections':
                return servers.reduce((best, current) => 
                    current.connections < best.connections ? current : best
                );
                
            case 'round_robin':
                return this.getRoundRobinServer();
                
            case 'response_time':
                return servers.reduce((best, current) => 
                    this.getAverageResponseTime(current) < this.getAverageResponseTime(best) ? current : best
                );
                
            default:
                return servers[0];
        }
    }

    getRoundRobinServer() {
        const servers = Array.from(this.servers.values())
            .filter(server => server.status === 'active');
        
        if (servers.length === 0) return null;
        
        this.currentIndex = (this.currentIndex + 1) % servers.length;
        return servers[this.currentIndex];
    }

    getAverageResponseTime(server) {
        if (server.responseTimes.length === 0) return 1000;
        
        return server.responseTimes.reduce((sum, time) => sum + time, 0) / server.responseTimes.length;
    }

    recordResponseTime(serverId, responseTime) {
        const server = this.servers.get(serverId);
        if (server) {
            server.responseTimes.push(responseTime);
            if (server.responseTimes.length > 100) {
                server.responseTimes = server.responseTimes.slice(-50);
            }
        }
    }
}

module.exports = ScalingSystem;