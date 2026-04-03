const { Schema, model } = require('mongoose')

const authorSchema = new Schema({
    orderId: {
        type: Schema.ObjectId,
        required: true
    },
    sellerId: {
        type: Schema.ObjectId,
        required: true
    },
    products: {
        type: Array,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    payment_type: {
        type: String,
        enum: ['online', 'cod'],
        required: true
    },
    payment_status: {
        type: String,
        required: true
    },
    shipping_fee: {
        type: Number,
        default: 0
    },
    shippingInfo: {
        type: Object,
        required: true
    },
    delivery_status: {
        type: String,
        enum: [
            'PENDING',
            'PROCESSING',
            'PACKED',
            'SHIPPED',
            'OUT_FOR_DELIVERY',
            'DELIVERED',
            'DELIVERY_REJECTED',
            'pending',
            'processing',
            'packed',
            'shipped',
            'out_for_delivery',
            'delivered',
            'delivery_rejected',
            'cancelled'
        ],
        default: 'PENDING'
    },
    order_status: {
        type: String,
        enum: ['PENDING', 'ACCEPT', 'REJECT'],
        default: 'PENDING'
    },
    commission_percent: {
        type: Number,
        default: 0
    },
    commission_amount: {
        type: Number,
        default: 0
    },
    seller_earning: {
        type: Number,
        default: 0
    },
    date: {
        type: String,
        required: true
    },
}, { timestamps: true })

module.exports = model('authorOrders', authorSchema)
