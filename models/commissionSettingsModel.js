const { Schema, model } = require('mongoose')

const commissionSettingsSchema = new Schema({
    commission_percent: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
        max: 100
    }
}, { timestamps: true })

/**
 * Fetches the single commission settings document.
 * Returns safe defaults if no document exists.
 */
commissionSettingsSchema.statics.getSettings = async function () {
    try {
        const settings = await this.findOne().sort({ updatedAt: -1 }).lean()
        if (settings) {
            return {
                commission_percent: settings.commission_percent ?? 0
            }
        }
    } catch (error) {
        console.error('Error fetching commission settings:', error.message)
    }
    return { commission_percent: 0 }
}

/**
 * Upserts the commission settings (singleton pattern).
 */
commissionSettingsSchema.statics.updateSettings = async function (data) {
    const existing = await this.findOne().sort({ updatedAt: -1 })
    if (existing) {
        existing.commission_percent = data.commission_percent
        await existing.save()
        return existing
    }
    return await this.create({
        commission_percent: data.commission_percent
    })
}

module.exports = model('commissionSettings', commissionSettingsSchema)
