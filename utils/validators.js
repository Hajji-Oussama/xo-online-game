// ===============================================
// 🛠️ أدوات التحقق من الصحة - فحص البيانات
// ===============================================

const Joi = require('joi');

class DataValidators {
    // 👤 تحقق من بيانات اللاعب
    static validatePlayerData(data) {
        const schema = Joi.object({
            playerName: Joi.string()
                .min(2)
                .max(20)
                .pattern(/^[\p{L}\p{N}\s_-]+$/u)
                .required()
                .messages({
                    'string.pattern.base': 'الاسم يمكن أن يحتوي على أحرف وأرقام ومسافات فقط',
                    'string.min': 'الاسم يجب أن يكون على الأقل 2 أحرف',
                    'string.max': 'الاسم يجب أن لا يتجاوز 20 حرف'
                }),

            playerId: Joi.string()
                .length(20)
                .optional(),

            avatar: Joi.string()
                .uri()
                .optional()
                .allow('')
        });

        return schema.validate(data);
    }

    // 🎯 تحقق من بيانات الحركة
    static validateMoveData(data) {
        const schema = Joi.object({
            cellIndex: Joi.number()
                .integer()
                .min(0)
                .max(8)
                .required()
                .messages({
                    'number.min': 'رقم الخلية يجب أن يكون بين 0 و 8',
                    'number.max': 'رقم الخلية يجب أن يكون بين 0 و 8'
                }),

            roomId: Joi.string()
                .length(8)
                .pattern(/^[A-Z0-9]+$/)
                .required(),

            timestamp: Joi.number()
                .integer()
                .min(Date.now() - 5000)
                .max(Date.now() + 1000)
                .required()
                .messages({
                    'number.min': 'الطابع الزمني غير صالح',
                    'number.max': 'الطابع الزمني غير صالح'
                })
        });

        return schema.validate(data);
    }

    // 📨 تحقق من بيانات الدعوة
    static validateInviteData(data) {
        const schema = Joi.object({
            targetId: Joi.string()
                .length(20)
                .required(),

            inviterId: Joi.string()
                .length(20)
                .optional(),

            inviteId: Joi.string()
                .pattern(/^inv_/)
                .optional()
        });

        return schema.validate(data);
    }

    // 🏠 تحقق من بيانات الغرفة
    static validateRoomData(data) {
        const schema = Joi.object({
            roomId: Joi.string()
                .length(8)
                .pattern(/^[A-Z0-9]+$/)
                .required(),

            playerIds: Joi.array()
                .items(Joi.string().length(20))
                .length(2)
                .required(),

            gameType: Joi.string()
                .valid('classic', 'quick', 'ranked')
                .default('classic')
        });

        return schema.validate(data);
    }

    // 🔧 تحقق من بيانات النظام
    static validateSystemData(data) {
        const schema = Joi.object({
            action: Joi.string()
                .valid('ping', 'getStats', 'getLeaderboard', 'cleanup')
                .required(),

            parameters: Joi.object()
                .optional(),

            authToken: Joi.string()
                .optional()
        });

        return schema.validate(data);
    }

    // 🛡️ تنظيف المدخلات
    static sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        
        return input
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;')
            .replace(/\\/g, '&#x5C;')
            .replace(/`/g, '&#x60;')
            .trim();
    }

    // 📧 تحقق من البريد الإلكتروني
    static validateEmail(email) {
        const schema = Joi.string()
            .email()
            .max(254);
        
        return schema.validate(email);
    }

    // 🔐 تحقق من كلمة المرور
    static validatePassword(password) {
        const schema = Joi.string()
            .min(8)
            .max(100)
            .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
            .messages({
                'string.pattern.base': 'كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم'
            });

        return schema.validate(password);
    }

    // 🌐 تحقق من العنوان
    static validateURL(url) {
        const schema = Joi.string()
            .uri()
            .max(2083);

        return schema.validate(url);
    }

    // 📞 تحقق من رقم الهاتف
    static validatePhone(phone) {
        const schema = Joi.string()
            .pattern(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/)
            .messages({
                'string.pattern.base': 'رقم الهاتف غير صالح'
            });

        return schema.validate(phone);
    }

    // 🎮 تحقق من بيانات اللعبة
    static validateGameConfig(config) {
        const schema = Joi.object({
            gameType: Joi.string()
                .valid('classic', 'timed', 'ranked')
                .default('classic'),

            timeLimit: Joi.number()
                .integer()
                .min(30)
                .max(300)
                .optional(),

            maxPlayers: Joi.number()
                .integer()
                .min(2)
                .max(4)
                .default(2),

            isPrivate: Joi.boolean()
                .default(false),

            allowSpectators: Joi.boolean()
                .default(true)
        });

        return schema.validate(config);
    }

    // 📊 تحقق من بيانات الإحصائيات
    static validateStatsQuery(query) {
        const schema = Joi.object({
            period: Joi.string()
                .valid('day', 'week', 'month', 'year', 'all')
                .default('week'),

            playerId: Joi.string()
                .length(20)
                .optional(),

            gameType: Joi.string()
                .valid('classic', 'timed', 'ranked', 'all')
                .default('all'),

            limit: Joi.number()
                .integer()
                .min(1)
                .max(1000)
                .default(100)
        });

        return schema.validate(query);
    }

    // 🛡️ تحقق من بيانات الأمان
    static validateSecurityConfig(config) {
        const schema = Joi.object({
            rateLimitEnabled: Joi.boolean().default(true),
            maxRequestsPerMinute: Joi.number().integer().min(10).max(1000).default(100),
            moveCooldown: Joi.number().integer().min(100).max(5000).default(400),
            sessionTimeout: Joi.number().integer().min(300000).max(3600000).default(1800000),
            allowCrossOrigin: Joi.boolean().default(false)
        });

        return schema.validate(config);
    }

    // 🔍 فحص عميق للكائن
    static deepValidate(object, schema) {
        try {
            const { error, value } = schema.validate(object, {
                abortEarly: false,
                allowUnknown: true,
                stripUnknown: true
            });

            if (error) {
                const errors = error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message,
                    type: detail.type
                }));

                return { isValid: false, errors, value: null };
            }

            return { isValid: true, errors: [], value };
        } catch (validationError) {
            return {
                isValid: false,
                errors: [{ field: 'validation', message: 'فشل في عملية التحقق', type: 'exception' }],
                value: null
            };
        }
    }

    // 🎯 تحقق سريع مع رسائل مخصصة
    static quickValidate(data, rules, customMessages = {}) {
        const schema = Joi.object(rules).messages(customMessages);
        return schema.validate(data, { abortEarly: false });
    }
}

module.exports = DataValidators;