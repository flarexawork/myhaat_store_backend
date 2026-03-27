const { Schema, model } = require('mongoose')

const sellerSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    mobile: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        match: [/^\+[1-9]\d{7,14}$/, 'Please enter valid mobile number with country code']
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationToken: {
        type: String,
        select: false
    },
    emailVerificationExpires: {
        type: Date,
        select: false
    },
    role: {
        type: String,
        default: 'seller'
    },
    status: {
        type: String,
        default: 'pending'
    },
    payment: {
        type: String,
        default: 'inactive'
    },
    method: {
        type: String,
        required: true,
    },
    image: {
        type: String,
        default: ''
    },
    shopInfo: {
        type: Object,
        default: {}
    },
    shopDetails: {
        shopName: {
            type: String
        },
        division: {
            type: String
        },
        district: {
            type: String
        },
        subDistrict: {
            type: String
        },
        shopImage: {
            type: String
        },
        shopImages: {
            type: [String],
            default: []
        }
    },
    identityDetails: {
        fullName: {
            type: String
        },
        address: {
            type: String
        },
        documentType: {
            type: String,
            enum: ['aadhaar', 'pan']
        },
        documentNumber: {
            type: String
        },
        documentImage: {
            type: String
        },
        documentImages: {
            type: [String],
            default: []
        }
    },
    verificationStatus: {
        type: String,
        enum: ['pending_details', 'pending_admin', 'approved'],
        default: 'pending_details'
    },
    accountStatus: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    adminRemark: {
        type: String,
        default: ''
    },
}, { timestamps: true })

sellerSchema.index({
    name: 'text',
    email: 'text'
}, {
    weights: {
        name: 5,
        email: 4,
    }
})

module.exports = model('sellers', sellerSchema)
