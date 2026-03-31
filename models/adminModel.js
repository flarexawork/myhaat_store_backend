const { Schema, model } = require('mongoose')

const adminSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    image: {
        type: String,
        required: true
    },
    role: {
        type: String,
        default: 'admin'
    },
    adminRole: {
        type: String,
        default: 'admin'
    },
    passwordChangedAt: {
        type: Date,
        default: null
    }
})

module.exports = model('admins',adminSchema)
