const { Schema, model } = require('mongoose')

const settingsSchema = new Schema({
    shipping_fee: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    }
}, { timestamps: true })

settingsSchema.statics.getSettings = async function () {
    try {
        const settings = await this.findOne().sort({ updatedAt: -1 }).lean()

        if (settings) {
            return {
                shipping_fee: Number(settings.shipping_fee) || 0
            }
        }
    } catch (error) {
        console.error('Error fetching app settings:', error.message)
    }

    return { shipping_fee: 0 }
}

settingsSchema.statics.updateSettings = async function (data) {
    const nextShippingFee = Number(data?.shipping_fee) || 0
    const existing = await this.findOne().sort({ updatedAt: -1 })

    if (existing) {
        existing.shipping_fee = nextShippingFee
        await existing.save()
        return existing
    }

    return await this.create({
        shipping_fee: nextShippingFee
    })
}

module.exports = model('settings', settingsSchema)
