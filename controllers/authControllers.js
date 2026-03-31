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
const securityAlertTemplate = require('../utiles/Template/securityAlert')
const {
    escapeRegex,
    getAdminPrivilegeRole,
    getClientDevice,
    getClientIp,
    getStrongPasswordMessage,
    isStrongPassword,
    normalizeText
} = require('../utiles/authSecurity')

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

const clearDashboardAccessCookie = (res) => {
    res.cookie('accessToken', '', {
        expires: new Date(Date.now()),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    })
}

const sendSecurityEmail = async ({ to, title, intro, req }) => {
    try {
        await sendMail({
            to,
            subject: title,
            html: securityAlertTemplate({
                title,
                intro,
                time: new Date().toISOString(),
                ip: getClientIp(req),
                device: getClientDevice(req)
            })
        })
    } catch (error) {
        console.log(error.message)
    }
}

const configureCloudinary = () => {
    cloudinary.config({
        cloud_name: process.env.CLOUD_NAME,
        api_key: process.env.API_KEY,
        api_secret: process.env.API_SECRET,
        secure: true
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
                        role: 'admin'
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
                if (!user) {
                    return responseReturn(res, 404, { error: 'User not found' })
                }

                const userInfo = user.toObject()
                userInfo.adminRole = getAdminPrivilegeRole(user)
                responseReturn(res, 200, { userInfo })
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
            configureCloudinary()
            const { image } = files
            try {
                if (!image?.filepath) {
                    return responseReturn(res, 400, { error: 'Image is required' })
                }

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

    admin_update_profile = async (req, res) => {
        if (req.role !== 'admin') {
            return responseReturn(res, 403, { message: 'unauthorized' })
        }

        const form = formidable({ multiples: false })

        form.parse(req, async (err, _, files) => {
            if (err) {
                return responseReturn(res, 400, { message: 'Unable to process profile update' })
            }

            const { image } = files

            try {
                if (!image?.filepath) {
                    return responseReturn(res, 400, { message: 'Image is required' })
                }

                configureCloudinary()

                const result = await cloudinary.uploader.upload(image.filepath, { folder: 'profile' })

                if (!result?.secure_url) {
                    return responseReturn(res, 400, { message: 'Image upload failed' })
                }

                const admin = await adminModel.findByIdAndUpdate(
                    req.id,
                    { image: result.secure_url },
                    { new: true }
                )

                if (!admin) {
                    return responseReturn(res, 404, { message: 'Admin not found' })
                }

                const userInfo = admin.toObject()
                userInfo.adminRole = getAdminPrivilegeRole(admin)

                return responseReturn(res, 200, {
                    message: 'Profile updated successfully',
                    userInfo
                })
            } catch (error) {
                return responseReturn(res, 500, { message: 'Unable to update profile' })
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

    seller_change_password = async (req, res) => {
        const { currentPassword, newPassword, confirmPassword } = req.body

        try {
            if (req.role !== 'seller') {
                return responseReturn(res, 403, { message: 'unauthorized' })
            }

            if (!currentPassword || !newPassword || !confirmPassword) {
                return responseReturn(res, 400, { message: 'All password fields are required' })
            }

            if (newPassword !== confirmPassword) {
                return responseReturn(res, 400, { message: 'New password and confirm password do not match' })
            }

            if (!isStrongPassword(newPassword)) {
                return responseReturn(res, 400, { message: getStrongPasswordMessage() })
            }

            const seller = await sellerModel.findById(req.id).select('+password')
            if (!seller) {
                return responseReturn(res, 404, { message: 'Seller not found' })
            }

            const passwordMatches = await bcrpty.compare(currentPassword, seller.password)
            if (!passwordMatches) {
                return responseReturn(res, 400, { message: 'Current password is incorrect' })
            }

            const reusedPassword = await bcrpty.compare(newPassword, seller.password)
            if (reusedPassword) {
                return responseReturn(res, 400, { message: 'New password must be different from your current password' })
            }

            seller.password = await bcrpty.hash(newPassword, 10)
            seller.passwordChangedAt = new Date()
            await seller.save()

            clearDashboardAccessCookie(res)
            await sendSecurityEmail({
                to: seller.email,
                title: 'Your Password Was Changed',
                intro: `Hello ${seller.name}, your seller account password was changed successfully.`,
                req
            })

            return responseReturn(res, 200, { message: 'Password changed successfully. Please login again.' })
        } catch (error) {
            return responseReturn(res, 500, { message: 'Unable to change password' })
        }
    }

    admin_change_password = async (req, res) => {
        const { currentPassword, newPassword, confirmPassword } = req.body

        try {
            if (req.role !== 'admin') {
                return responseReturn(res, 403, { message: 'unauthorized' })
            }

            if (!currentPassword || !newPassword || !confirmPassword) {
                return responseReturn(res, 400, { message: 'All password fields are required' })
            }

            if (newPassword !== confirmPassword) {
                return responseReturn(res, 400, { message: 'New password and confirm password do not match' })
            }

            if (!isStrongPassword(newPassword)) {
                return responseReturn(res, 400, { message: getStrongPasswordMessage() })
            }

            const admin = await adminModel.findById(req.id).select('+password email name adminRole')
            if (!admin) {
                return responseReturn(res, 404, { message: 'Admin not found' })
            }

            const passwordMatches = await bcrpty.compare(currentPassword, admin.password)
            if (!passwordMatches) {
                return responseReturn(res, 400, { message: 'Current password is incorrect' })
            }

            const reusedPassword = await bcrpty.compare(newPassword, admin.password)
            if (reusedPassword) {
                return responseReturn(res, 400, { message: 'New password must be different from your current password' })
            }

            admin.password = await bcrpty.hash(newPassword, 10)
            admin.passwordChangedAt = new Date()
            await admin.save()

            clearDashboardAccessCookie(res)
            await sendSecurityEmail({
                to: admin.email,
                title: 'Your Password Was Changed',
                intro: `Hello ${admin.name}, your admin account password was changed successfully.`,
                req
            })

            return responseReturn(res, 200, { message: 'Password changed successfully. Please login again.' })
        } catch (error) {
            return responseReturn(res, 500, { message: 'Unable to change password' })
        }
    }

    create_admin = async (req, res) => {
        const { name, email, password, role } = req.body

        try {
            if (req.role !== 'admin') {
                return responseReturn(res, 403, { message: 'unauthorized' })
            }

            if (req.adminRole !== 'super_admin') {
                return responseReturn(res, 403, { message: 'Only super admin can create new admin accounts' })
            }

            const username = normalizeText(name)
            const normalizedEmail = normalizeEmail(email)
            const adminRole = role === 'super_admin' ? 'super_admin' : 'admin'

            if (!username || !normalizedEmail || !password) {
                return responseReturn(res, 400, { message: 'Username, email and password are required' })
            }

            if (!isStrongPassword(password)) {
                return responseReturn(res, 400, { message: getStrongPasswordMessage() })
            }

            const existingAdminByEmail = await adminModel.findOne({ email: normalizedEmail })
            if (existingAdminByEmail) {
                return responseReturn(res, 409, { message: 'Email already exists' })
            }

            const existingAdminByName = await adminModel.findOne({
                name: { $regex: new RegExp(`^${escapeRegex(username)}$`, 'i') }
            })
            if (existingAdminByName) {
                return responseReturn(res, 409, { message: 'Username already exists' })
            }

            const admin = await adminModel.create({
                name: username,
                email: normalizedEmail,
                password: await bcrpty.hash(password, 10),
                image: 'admin.png',
                role: 'admin',
                adminRole
            })

            await sendSecurityEmail({
                to: admin.email,
                title: 'Admin Account Created',
                intro: `Hello ${admin.name}, an admin account was created for you on MyHaat.`,
                req
            })

            return responseReturn(res, 201, {
                message: 'Admin created successfully',
                admin: {
                    _id: admin._id,
                    name: admin.name,
                    email: admin.email,
                    adminRole
                }
            })
        } catch (error) {
            return responseReturn(res, 500, { message: 'Unable to create admin account' })
        }
    }

    update_admin_username = async (req, res) => {
        const username = normalizeText(req.body?.name)

        try {
            if (req.role !== 'admin') {
                return responseReturn(res, 403, { message: 'unauthorized' })
            }

            if (!username) {
                return responseReturn(res, 400, { message: 'Username is required' })
            }

            const duplicateAdmin = await adminModel.findOne({
                _id: { $ne: req.id },
                name: { $regex: new RegExp(`^${escapeRegex(username)}$`, 'i') }
            })

            if (duplicateAdmin) {
                return responseReturn(res, 409, { message: 'Username already exists' })
            }

            const admin = await adminModel.findByIdAndUpdate(
                req.id,
                { name: username },
                { new: true }
            )

            if (!admin) {
                return responseReturn(res, 404, { message: 'Admin not found' })
            }

            const userInfo = admin.toObject()
            userInfo.adminRole = getAdminPrivilegeRole(admin)

            return responseReturn(res, 200, {
                message: 'Username updated successfully',
                userInfo
            })
        } catch (error) {
            return responseReturn(res, 500, { message: 'Unable to update username' })
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
