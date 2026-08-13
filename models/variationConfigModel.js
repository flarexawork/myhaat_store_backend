const { Schema, model } = require('mongoose')

const variationConfigSchema = new Schema({
    categoryId: {
        type: Schema.ObjectId,
        ref: 'categorys',
        required: true,
        unique: true
    },
    variations: {
        type: Array,
        default: []
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true })

variationConfigSchema.index({ categoryId: 1 }, { unique: true })

module.exports = model('variationConfigs', variationConfigSchema)
