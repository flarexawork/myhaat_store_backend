const { Schema, model } = require('mongoose')

const cardSchema = new Schema({
    userId : {
        type : Schema.ObjectId,
        required : true
    },
    productId : {
        type : Schema.ObjectId,
        required : true
    },
    quantity : {
        type : Number,
        required : true
    },
    selectedVariation: {
        type: Object,
        default: null
    },
    variantKey: {
        type: String,
        default: ''
    }
},{timestamps : true})

cardSchema.index({ userId: 1, productId: 1, variantKey: 1 })

module.exports = model('cardProducts',cardSchema)
