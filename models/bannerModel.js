const { Schema, model } = require('mongoose')

const bannerSchema = new Schema({
    productId: {
        type: Schema.ObjectId,
        default: null
    },
    banner: {
        type: String,
        required: true
    },
    link: {
        type: String,
        default: ''
    }

}, { timestamps: true })

module.exports = model('banners', bannerSchema)
