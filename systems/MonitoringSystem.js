// ===============================================
// 📊 نظام المراقبة - تتبع الأداء والنشاط
// ===============================================

class MonitoringSystem {
    constructor() {
        this.activities = [];
        this.performanceStats = {
            connections: 0,
            gamesPlayed: 0,
            movesMade: 0,
            errors: 0,
            startTime: Date.now()
        };
        
        this.MAX_ACTIVITIES = 1000;
        
        console.log('📊 نظام المراقبة - جاهز');
    }

    logActivity(playerId, action, data) {
        const activity = {
            playerId,
            action,
            data,
            timestamp: Date.now(),
            ip: this.getPlayerIP(playerId)
        };

        this.activities.push(activity);
        
        // الحفاظ على حجم البيانات
        if (this.activities.length > this.MAX_ACTIVITIES) {
            this.activities = this.activities.slice(-this.MAX_ACTIVITIES);
        }

        // تحديث الإحصائيات
        this.updateStats(action);
        
        // 🆕 اكتشاف الأنشطة المشبوهة
        this.detectSuspiciousActivity(activity);
    }

    updateStats(action) {
        switch (action) {
            case 'connection':
                this.performanceStats.connections++;
                break;
            case 'game_completed':
                this.performanceStats.gamesPlayed++;
                break;
            case 'make_move':
                this.performanceStats.movesMade++;
                break;
            case 'invalid_move':
            case 'join_lobby_failed':
                this.performanceStats.errors++;
                break;
        }
    }

    detectSuspiciousActivity(activity) {
        // 🚫 اكتشاف الحركات السريعة جداً
        if (activity.action === 'make_move') {
            const recentMoves = this.activities.filter(a => 
                a.playerId === activity.playerId && 
                a.action === 'make_move' &&
                activity.timestamp - a.timestamp < 1000 // أقل من ثانية
            );

            if (recentMoves.length > 5) {
                console.log(`🚨 نشاط مشبوه: ${activity.playerId} - حركات سريعة جداً`);
                this.logSuspiciousActivity(activity.playerId, 'fast_moves', recentMoves.length);
            }
        }

        // 🚫 اكتشاف محاولات متكررة فاشلة
        if (activity.action.includes('failed') || activity.action.includes('invalid')) {
            const recentFailures = this.activities.filter(a => 
                a.playerId === activity.playerId && 
                (a.action.includes('failed') || a.action.includes('invalid')) &&
                activity.timestamp - a.timestamp < 60000 // دقيقة واحدة
            );

            if (recentFailures.length > 3) {
                console.log(`🚨 نشاط مشبوه: ${activity.playerId} - محاولات فاشلة متكررة`);
                this.logSuspiciousActivity(activity.playerId, 'repeated_failures', recentFailures.length);
            }
        }
    }

    logSuspiciousActivity(playerId, type, count) {
        // 🆕 يمكن إرسال إشعار للمشرف أو حفظ في سجل منفصل
        console.log(`🚨 نشاط مشبوه - اللاعب: ${playerId}, النوع: ${type}, العدد: ${count}`);
        
        // حفظ في سجل المشبوهات
        const suspiciousLog = {
            playerId,
            type,
            count,
            timestamp: Date.now(),
            activities: this.activities.filter(a => a.playerId === playerId)
        };
        
        // 🆕 يمكن إرسال بريد إلكتروني أو إشعار للمشرف
        this.notifyAdmin(suspiciousLog);
    }

    notifyAdmin(log) {
        // 🆕 تنفيذ إرسال إشعار للمشرف
        if (process.env.ADMIN_EMAIL) {
            // إرسال بريد إلكتروني
            console.log(`📧 إشعار للمشرف: نشاط مشبوه - ${log.playerId}`);
        }
    }

    // 📈 مراقبة الأداء
    monitorPerformance() {
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();
        
        const performanceReport = {
            timestamp: new Date().toISOString(),
            memory: {
                used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
                total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB'
            },
            uptime: this.formatUptime(uptime),
            activities: this.activities.length,
            ...this.performanceStats
        };

        // 🆕 حفظ تقرير الأداء
        this.savePerformanceReport(performanceReport);
        
        // 🆕 التحقق من تسرب الذاكرة
        this.checkMemoryLeak(memoryUsage);

        return performanceReport;
    }

    checkMemoryLeak(memoryUsage) {
        const usedMB = memoryUsage.heapUsed / 1024 / 1024;
        
        if (usedMB > 500) { // إذا تجاوز 500MB
            console.warn('⚠️  تحذير: استخدام عالي للذاكرة - ' + usedMB + 'MB');
            
            // 🆕 يمكن اتخاذ إجراءات مثل إعادة التشغيل أو تنظيف الذاكرة
            if (usedMB > 1000) {
                console.error('🚨 خطر: استخدام ذاكرة مرتفع جداً -考虑 إعادة التشغيل');
            }
        }
    }

    // 📊 التقارير والإحصائيات
    getServerStats() {
        return {
            onlinePlayers: this.getOnlinePlayersCount(),
            activeRooms: this.getActiveRoomsCount(),
            totalGames: this.performanceStats.gamesPlayed,
            uptime: this.formatUptime(process.uptime()),
            performance: this.monitorPerformance()
        };
    }

    getRecentActivities(limit = 50) {
        return this.activities
            .slice(-limit)
            .reverse();
    }

    getOnlinePlayersCount() {
        // 🆕 يجب الحصول من PlayerManager
        return this.performanceStats.connections;
    }

    getActiveRoomsCount() {
        // 🆕 يجب الحصول من GameManager
        return Math.floor(this.performanceStats.gamesPlayed / 2);
    }

    // 🛠️ أدوات مساعدة
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        return `${days} أيام, ${hours} ساعات, ${minutes} دقائق`;
    }

    getPlayerIP(playerId) {
        // 🆕 يجب الحصول من Socket أو PlayerManager
        return 'unknown';
    }

    savePerformanceReport(report) {
        // 🆕 حفظ التقارير في ملف أو قاعدة بيانات
        if (process.env.NODE_ENV === 'production') {
            console.log('📊 تقرير الأداء:', report);
        }
    }

    // 🧹 تنظيف البيانات القديمة
    cleanupOldActivities() {
        const oneHourAgo = Date.now() - 3600000;
        this.activities = this.activities.filter(activity => 
            activity.timestamp > oneHourAgo
        );
    }
}

module.exports = MonitoringSystem;