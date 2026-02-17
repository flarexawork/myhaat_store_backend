const adminModel = require('../models/adminModel')
const sellerModel = require('../models/sellerModel')
const sellerCustomerModel = require('../models/chat/sellerCustomerModel')
const bcrpty = require('bcrypt')
const formidable = require('formidable')
const cloudinary = require('cloudinary').v2
const { responseReturn } = require('../utiles/response')
const { createToken } = require('../utiles/tokenCreate')

const sendMail = require('../utiles/mailer')
const welcomeTemplate = require('../utiles/Template/welcome')





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
                : { email: credential.toLowerCase() }

            const seller = await sellerModel
                .findOne(query)
                .select('+password')

            if (!seller) {
                return responseReturn(res, 404, { error: "Invalid email or mobile" })
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
                message: 'Login success'
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


            const emailExist = await sellerModel.findOne({ email })
            if (emailExist) {
                return responseReturn(res, 409, { error: 'Email already exists' })
            }


            const mobileExist = await sellerModel.findOne({ mobile })
            if (mobileExist) {
                return responseReturn(res, 409, { error: 'Mobile number already exists' })
            }


            const seller = await sellerModel.create({
                name,
                email,
                mobile,
                password: await bcrpty.hash(password, 10),
                method: 'manually',
                shopInfo: {}
            })

            await sellerCustomerModel.create({
                myId: seller.id
            })

            const token = await createToken({ id: seller.id, role: seller.role })

            res.cookie('accessToken', token, {
                expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                httpOnly: true
            })
            await sendMail({
                to: email,
                subject: "Welcome to Ecommerce",
                html: welcomeTemplate(name)
            })

            return responseReturn(res, 201, { token, message: 'Register success' })

        } catch (error) {
            console.log(error)
            return responseReturn(res, 500, { error: error.message })
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
                responseReturn(res, 200, { userInfo: seller })
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
                cloud_name: process.env.cloud_name,
                api_key: process.env.api_key,
                api_secret: process.env.api_secret,
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
        const { division, district, shopName, sub_district } = req.body;
        const { id } = req;

        try {
            await sellerModel.findByIdAndUpdate(id, {
                shopInfo: {
                    shopName,
                    division,
                    district,
                    sub_district
                }
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