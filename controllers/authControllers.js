const adminModel = require('../models/adminModel')
const sellerModel = require('../models/sellerModel')
const sellerCustomerModel = require('../models/chat/sellerCustomerModel')
const bcrpty = require('bcrypt')
const crypto = require('crypto')
const formidable = require('formidable')
const cloudinary = require('cloudinary').v2
const { responseReturn } = require('../utiles/response')
const { createToken } = require('../utiles/tokenCreate')
const {
    getSellerVerificationFlags,
    normalizeAccountStatus,
    normalizeAdminRemark,
    normalizeVerificationMedia
} = require('../utiles/sellerVerification')

const sendMail = require('../utiles/mailer')
const emailVerificationTemplate = require('../utiles/Template/emailVerification')

const EMAIL_VERIFICATION_EXPIRES_MS = 24 * 60 * 60 * 1000

const normalizeEmail = (email = '') => email.trim().toLowerCase()

const hashToken = (value) => crypto.createHash('sha256').update(value).digest('hex')

const getSellerFrontendUrl = () => {
    return (
        process.env.SELLER_FRONTEND_URL ||
        process.env.ADMIN_PANEL_PRODUCTION_URL ||
        process.env.ADMIN_PANEL_LCOAL_URL ||
        'http://localhost:3001'
    ).replace(/\/+$/, '')
}

const sendSellerVerificationEmail = async (seller) => {
    const verificationToken = crypto.randomBytes(32).toString('hex')

    seller.emailVerificationToken = hashToken(verificationToken)
    seller.emailVerificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRES_MS)
    await seller.save()

    const verificationLink = `${getSellerFrontendUrl()}/email-verify?token=${verificationToken}`

    await sendMail({
        to: seller.email,
        subject: 'Verify Your Email - MyHaat',
        html: emailVerificationTemplate(seller.name, verificationLink)
    })
}





class authControllers {
    admin_login = async (req, res) => {


        const { email, password } = req.body
        try {
            const admin = await adminModel.findOne({ email }).select('+password')
            if (admin) {
                const match = await bcrpty.compare(password, admin.password)
                if (match) {
                    const token = await createToken({
                        id: admin.id,
                        role: admin.role
                    })
                    res.cookie('accessToken', token, {
                        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    })
                    responseReturn(res, 200, { token, message: 'Login success' })
                } else {
                    responseReturn(res, 404, { error: "Password wrong" })
                }
            } else {
                responseReturn(res, 404, { error: "Email not found" })
            }
        } catch (error) {
            responseReturn(res, 500, { error: error.message })
        }
    }

    seller_login = async (req, res) => {

        const { credential, password } = req.body
        // credential = email OR mobile

        try {

            if (!credential || !password) {
                return responseReturn(res, 400, { error: "All fields are required" })
            }

            // Detect if input is mobile (starts with + and digits)
            const isMobile = /^\+[1-9]\d{7,14}$/.test(credential)

            // Build dynamic query
            const query = isMobile
                ? { mobile: credential }
                : { email: normalizeEmail(credential) }

            const seller = await sellerModel
                .findOne(query)
                .select('+password')

            if (!seller) {
                return responseReturn(res, 404, { error: "Invalid email or mobile" })
            }

            if (seller.isEmailVerified === false) {
                return responseReturn(res, 403, {
                    success: false,
                    message: 'Please verify your email before logging in'
                })
            }

            const match = await bcrpty.compare(password, seller.password)

            if (!match) {
                return responseReturn(res, 400, { error: "Invalid password" })
            }

            const token = await createToken({
                id: seller.id,
                role: seller.role
            })

            res.cookie('accessToken', token, {
                expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            })

            return responseReturn(res, 200, {
                token,
                message: 'Login success',
                ...getSellerVerificationFlags(seller)
            })

        } catch (error) {
            console.log(error)
            return responseReturn(res, 500, { error: error.message })
        }
    }

    seller_register = async (req, res) => {
        const { email, name, password, mobile } = req.body

        try {

            if (!email || !name || !password || !mobile) {
                return responseReturn(res, 400, { error: 'All fields are required' })
            }


            const mobileRegex = /^\+[1-9]\d{7,14}$/
            if (!mobileRegex.test(mobile)) {
                return responseReturn(res, 400, { error: 'Invalid mobile number format. Use country code like +919876543210' })
            }


            const normalizedEmail = normalizeEmail(email)

            const emailExist = await sellerModel.findOne({ email: normalizedEmail })
            if (emailExist) {
                return responseReturn(res, 409, { error: 'Email already exists' })
            }


            const mobileExist = await sellerModel.findOne({ mobile })
            if (mobileExist) {
                return responseReturn(res, 409, { error: 'Mobile number already exists' })
            }


            const seller = await sellerModel.create({
                name,
                email: normalizedEmail,
                mobile,
                password: await bcrpty.hash(password, 10),
                method: 'manually',
                shopInfo: {},
                isEmailVerified: false
            })

            await sellerCustomerModel.create({
                myId: seller.id
            })

            const token = await createToken({ id: seller.id, role: seller.role })

            res.cookie('accessToken', token, {
                expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                httpOnly: true
            })

            let emailSent = true
            try {
                await sendSellerVerificationEmail(seller)
            } catch (mailError) {
                emailSent = false
                console.log(mailError.message)
            }

            return responseReturn(res, 201, {
                token,
                message: emailSent
                    ? 'Register success. Please verify your email.'
                    : 'Register success, but the verification email could not be sent.'
            })

        } catch (error) {
            console.log(error)
            return responseReturn(res, 500, { error: error.message })
        }
    }

    seller_verify_email = async (req, res) => {
        const { token } = req.query

        try {
            if (!token) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'Invalid or expired verification link'
                })
            }

            const seller = await sellerModel
                .findOne({
                    emailVerificationToken: hashToken(token),
                    emailVerificationExpires: { $gt: new Date() }
                })
                .select('+emailVerificationToken +emailVerificationExpires')

            if (!seller) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'Invalid or expired verification link'
                })
            }

            seller.isEmailVerified = true
            seller.emailVerificationToken = null
            seller.emailVerificationExpires = null
            await seller.save()

            return responseReturn(res, 200, {
                success: true,
                message: 'Email verified successfully'
            })
        } catch (error) {
            console.log(error)
            return responseReturn(res, 500, {
                success: false,
                message: 'Internal server error'
            })
        }
    }

    seller_resend_verification = async (req, res) => {
        const { email } = req.body

        try {
            if (!email) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'Email is required'
                })
            }

            const seller = await sellerModel
                .findOne({ email: normalizeEmail(email) })
                .select('+emailVerificationToken +emailVerificationExpires')

            if (!seller) {
                return responseReturn(res, 404, {
                    success: false,
                    message: 'Email not found'
                })
            }

            if (seller.isEmailVerified) {
                return responseReturn(res, 400, {
                    success: false,
                    message: 'Email already verified'
                })
            }

            await sendSellerVerificationEmail(seller)

            return responseReturn(res, 200, {
                success: true,
                message: 'Verification email sent successfully'
            })
        } catch (error) {
            console.log(error)
            return responseReturn(res, 500, {
                success: false,
                message: 'Unable to send verification email'
            })
        }
    }


    getUser = async (req, res) => {
        const { id, role } = req;

        try {
            if (role === 'admin') {
                const user = await adminModel.findById(id)
                responseReturn(res, 200, { userInfo: user })
            } else {
                const seller = await sellerModel.findById(id)
                const verificationFlags = getSellerVerificationFlags(seller)
                const userInfo = seller ? seller.toObject() : null

                if (userInfo) {
                    const normalizedUserInfo = normalizeVerificationMedia(userInfo)
                    normalizedUserInfo.verificationStatus = verificationFlags.verificationStatus
                    normalizedUserInfo.accountStatus = normalizeAccountStatus(seller)
                    normalizedUserInfo.adminRemark = normalizeAdminRemark(seller)

                    return responseReturn(res, 200, {
                        userInfo: normalizedUserInfo,
                        ...verificationFlags
                    })
                }

                responseReturn(res, 200, {
                    userInfo,
                    ...verificationFlags
                })
            }
        } catch (error) {
            responseReturn(res, 500, { error: 'Internal server error' })
        }
    }

    profile_image_upload = async (req, res) => {
        const { id } = req
        const form = formidable({ multiples: true })
        form.parse(req, async (err, _, files) => {
            cloudinary.config({
                CLOUD_NAME: process.env.CLOUD_NAME,
                API_KEY: process.env.API_KEY,
                API_SECRET: process.env.API_SECRET,
                secure: true
            })
            const { image } = files
            try {
                const result = await cloudinary.uploader.upload(image.filepath, { folder: 'profile' })
                if (result) {
                    await sellerModel.findByIdAndUpdate(id, {
                        image: result.secure_url
                    })
                    const userInfo = await sellerModel.findById(id)
                    responseReturn(res, 201, { message: 'image upload success', userInfo })
                } else {
                    responseReturn(res, 404, { error: 'image upload failed' })
                }
            } catch (error) {
                //console.log(error)
                responseReturn(res, 500, { error: error.message })
            }
        })
    }

    profile_info_add = async (req, res) => {
        const { division, district, shopName, sub_district, subDistrict } = req.body;
        const { id } = req;
        const resolvedSubDistrict = subDistrict || sub_district

        try {
            await sellerModel.findByIdAndUpdate(id, {
                'shopInfo.shopName': shopName,
                'shopInfo.division': division,
                'shopInfo.district': district,
                'shopInfo.sub_district': resolvedSubDistrict,
                'shopDetails.shopName': shopName,
                'shopDetails.division': division,
                'shopDetails.district': district,
                'shopDetails.subDistrict': resolvedSubDistrict
            })
            const userInfo = await sellerModel.findById(id)
            responseReturn(res, 201, { message: 'Profile info add success', userInfo })
        } catch (error) {
            responseReturn(res, 500, { error: error.message })
        }
    }

    logout = async (req, res) => {
        try {
            res.cookie('accessToken', null, {
                expires: new Date(Date.now()),
                httpOnly: true
            })
            responseReturn(res, 200, { message: 'logout success' })
        } catch (error) {
            responseReturn(res, 500, { error: error.message })
        }
    }
}
module.exports = new authControllers()
