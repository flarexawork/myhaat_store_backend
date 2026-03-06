
const { Schema, model } = require('mongoose')

const customerOrderSchema = new Schema({

    customerId: {
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

    shippingInfo: {
        type: Object,
        required: true
    },

    payment_type: {
        type: String,
        enum: ['online', 'cod'],
        required: true
    },

    payment_status: {
        type: String,
        enum: ['pending', 'paid', 'cod', 'failed', 'refunded'],
        default: 'pending'
    },

    razorpay_order_id: {
        type: String,
        default: null
    },
    razorpay_payment_id: {
        type: String,
        default: null
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
        default: 10
    },


    date: {
        type: String,
        required: true
    }

}, { timestamps: true })


module.exports = model('customerOrders', customerOrderSchema)
