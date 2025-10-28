// ===============================================
// 🔧 الأدوات المساعدة - دوال مساعدة
// ===============================================

class Helpers {
    // ⏱️ أدوات الوقت
    static formatTime(seconds) {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    }

    static formatDate(timestamp) {
        return new Date(timestamp).toLocaleString('ar-EG', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    static timeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (days > 0) return `منذ ${days} يوم`;
        if (hours > 0) return `منذ ${hours} ساعة`;
        if (minutes > 0) return `منذ ${minutes} دقيقة`;
        return 'الآن';
    }

    // 🔢 أدوات الأرقام
    static formatNumber(number) {
        return new Intl.NumberFormat('ar-EG').format(number);
    }

    static randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    static clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    // 📝 أدوات النصوص
    static truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    static capitalizeFirst(text) {
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    static sanitizeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // 🎯 أدوات المصفوفات
    static shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    static chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    static uniqueArray(array) {
        return [...new Set(array)];
    }

    // 🔐 أدوات التشفير
    static generateId(length = 20) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    static generateToken() {
        return this.generateId(32);
    }

    static hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }

    // 🌐 أدوات الشبكة
    static getClientIP(socket) {
        return socket.handshake.headers['x-forwarded-for'] || 
               socket.handshake.address;
    }

    static isValidIP(ip) {
        const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
        const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        return ipv4Pattern.test(ip) || ipv6Pattern.test(ip);
    }

    // 📊 أدوات الأداء
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    static throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    static measurePerformance(fn, ...args) {
        const start = performance.now();
        const result = fn(...args);
        const end = performance.now();
        
        return {
            result,
            duration: end - start,
            timestamp: Date.now()
        };
    }

    // 🎮 أدوات اللعبة
    static calculateRatingChange(winnerRating, loserRating, kFactor = 32) {
        const expected = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
        return Math.round(kFactor * (1 - expected));
    }

    static generateBoardPosition() {
        return Array(9).fill(null);
    }

    static isValidBoardPosition(board) {
        if (!Array.isArray(board) || board.length !== 9) return false;
        
        let xCount = 0, oCount = 0;
        for (let cell of board) {
            if (cell !== null && cell !== 'X' && cell !== 'O') return false;
            if (cell === 'X') xCount++;
            if (cell === 'O') oCount++;
        }
        
        return Math.abs(xCount - oCount) <= 1;
    }

    // 📁 أدوات الملفات
    static getFileExtension(filename) {
        return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2);
    }

    static isValidFilename(filename) {
        const invalidChars = /[<>:"/\\|?*\x00-\x1F]/;
        return !invalidChars.test(filename) && filename.length > 0 && filename.length <= 255;
    }

    static formatFileSize(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    // 🔄 أدوات التحويل
    static deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj);
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        
        const cloned = {};
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = this.deepClone(obj[key]);
            }
        }
        return cloned;
    }

    static serialize(obj) {
        return JSON.stringify(obj, (key, value) => {
            if (value instanceof Map) {
                return {
                    dataType: 'Map',
                    value: Array.from(value.entries())
                };
            }
            return value;
        });
    }

    static deserialize(str) {
        return JSON.parse(str, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (value.dataType === 'Map') {
                    return new Map(value.value);
                }
            }
            return value;
        });
    }

    // 🎲 أدوات عشوائية
    static weightedRandom(weights) {
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        let random = Math.random() * total;
        
        for (let i = 0; i < weights.length; i++) {
            random -= weights[i];
            if (random < 0) return i;
        }
        
        return weights.length - 1;
    }

    static randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    // 📈 أدوات الإحصائيات
    static calculateAverage(numbers) {
        if (numbers.length === 0) return 0;
        return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
    }

    static calculateMedian(numbers) {
        if (numbers.length === 0) return 0;
        
        const sorted = [...numbers].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        
        if (sorted.length % 2 === 0) {
            return (sorted[middle - 1] + sorted[middle]) / 2;
        }
        
        return sorted[middle];
    }

    static calculateStandardDeviation(numbers) {
        if (numbers.length === 0) return 0;
        
        const avg = this.calculateAverage(numbers);
        const squareDiffs = numbers.map(num => Math.pow(num - avg, 2));
        const avgSquareDiff = this.calculateAverage(squareDiffs);
        
        return Math.sqrt(avgSquareDiff);
    }

    // 🛠️ أدوات التصحيح
    static logWithTimestamp(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${level}] ${message}`);
    }

    static measureMemoryUsage() {
        if (global.gc) {
            global.gc();
        }
        
        const usage = process.memoryUsage();
        return {
            rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
            external: Math.round(usage.external / 1024 / 1024) + 'MB'
        };
    }
}

module.exports = Helpers;