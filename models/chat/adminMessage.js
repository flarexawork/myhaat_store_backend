const mongoose = require('mongoose')

const adminMessageSchema = new mongoose.Schema({
    senderId: {
        type: String,
        required: true
    },
    senderRole: {
        type: String,
        enum: ['admin', 'seller', 'customer'],
        required: true
    },
    receiverId: {
        type: String,
        required: true
    },
    receiverRole: {
        type: String,
        enum: ['admin', 'seller', 'customer'],
        required: true
    },
    message: {
        type: String,
        required: true
    }
}, { timestamps: true })

module.exports = mongoose.model('adminMessage', adminMessageSchema)
