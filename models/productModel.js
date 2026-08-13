const { Schema, model } = require('mongoose')

const productSchema = new Schema({
    sellerId: {
        type: Schema.ObjectId,
        ref: 'sellers',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    slug: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    categoryId: {
        type: Schema.ObjectId,
        ref: 'categorys',
        default: null
    },
    brand: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    stock: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        required: true
    },

    description: {
        type: String,
        required: true
    },
    shopName: {
        type: String,
        required: true
    },
    approval_status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    approvedBy: {
        type: Schema.ObjectId,
        default: null
    },
    approvedAt: {
        type: Date,
        default: null
    },
    images: {
        type: Array,
        required: true
    },
    variations: {
        type: Array,
        default: []
    },
    variantCombinations: {
        type: Array,
        default: []
    },
    deliveryPincodes: {
        type: [String],
        default: []
    },
    rating: {
        type: Number,
        default: 0
    }
}, { timestamps: true })

productSchema.index({
    name: 'text',
    category: 'text',
    brand: 'text',
    description: 'text'
}, {
    weights: {
        name: 5,
        category: 4,
        brand: 3,
        description: 2
    }
})

productSchema.index({ categoryId: 1 })
productSchema.index({ deliveryPincodes: 1 })

module.exports = model('products', productSchema)
