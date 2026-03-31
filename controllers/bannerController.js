const formidable = require('formidable')
const productModel = require('../models/productModel')
const cloudinary = require('cloudinary').v2
const { responseReturn } = require('../utiles/response')
const bannerModel = require('../models/bannerModel')
const { mongo: { ObjectId } } = require('mongoose')

const getCloudinaryPublicId = (url = '') => {
    if (!url) return null

    const parts = url.split('/')
    const uploadIndex = parts.findIndex((p) => p === 'upload')
    if (uploadIndex === -1) return null

    let publicIdParts = parts.slice(uploadIndex + 1)
    if (publicIdParts[0] && publicIdParts[0].startsWith('v')) {
        publicIdParts = publicIdParts.slice(1)
    }

    if (!publicIdParts.length) return null
    return publicIdParts.join('/').replace(/\.[^/.]+$/, '')
}

class bannerController {
    add_banner = async (req, res) => {
        if (req.role !== 'admin') {
            return responseReturn(res, 401, { message: 'unauthorized' })
        }

        const form = formidable({ multiples: true })
        form.parse(req, async (err, field, files) => {
            const { productId, link } = field
            const { image } = files

            if (!image) {
                return responseReturn(res, 400, { message: 'Banner image is required' })
            }

            cloudinary.config({
            cloud_name: process.env.CLOUD_NAME,
            api_key: process.env.API_KEY,
            api_secret: process.env.API_SECRET,
            secure: true
        })

            try {
                let finalLink = String(link || '').trim()
                let resolvedProductId = null

                if (productId) {
                    if (!ObjectId.isValid(productId)) {
                        return responseReturn(res, 400, { message: 'Valid productId required' })
                    }

                    const product = await productModel.findById(productId).select('slug')
                    if (!product) {
                        return responseReturn(res, 404, { message: 'Product not found' })
                    }

                    resolvedProductId = productId
                    if (!finalLink) {
                        finalLink = product.slug
                    }
                }

                const result = await cloudinary.uploader.upload(image.filepath, { folder: 'banners' })

                const payload = {
                    banner: result.secure_url,
                    link: finalLink
                }

                if (resolvedProductId) {
                    payload.productId = resolvedProductId
                }

                const banner = await bannerModel.create(payload)
                responseReturn(res, 201, { banner, message: "banner add success" })
            } catch (error) {
                console.log(error)
                responseReturn(res, 500, { message: error.message })
            }


        })
    }

    get_banner = async (req, res) => {
        const { productId } = req.params

        try {
            if (!productId || !ObjectId.isValid(productId)) {
                return responseReturn(res, 400, { message: 'Valid productId required' })
            }
            const banner = await bannerModel.findOne({ productId: new ObjectId(productId) })
            responseReturn(res, 200, { banner })
        } catch (error) {
            console.log(error)
            responseReturn(res, 500, { message: error.message })
        }
    }

    get_admin_banners = async (req, res) => {
        if (req.role !== 'admin') {
            return responseReturn(res, 401, { message: 'unauthorized' })
        }

        try {
            const banners = await bannerModel.find({}).sort({ createdAt: -1 })
            responseReturn(res, 200, { banners })
        } catch (error) {
            console.log(error)
            responseReturn(res, 500, { message: error.message })
        }
    }

    get_banners = async (req, res) => {

        try {
            const banners = await bannerModel.aggregate([
                {
                    $sample: {
                        size: 10
                    }
                }
            ])
            responseReturn(res, 200, { banners })
        } catch (error) {
            console.log(error)
            responseReturn(res, 500, { message: error.message })
        }
    }

    update_banner = async (req, res) => {
        if (req.role !== 'admin') {
            return responseReturn(res, 401, { message: 'unauthorized' })
        }

        const { bannerId } = req.params
        const form = formidable({})

        form.parse(req, async (err, _, files) => {
            const { image } = files

            if (!bannerId || !ObjectId.isValid(bannerId)) {
                return responseReturn(res, 400, { message: 'Valid bannerId required' })
            }

            if (!image) {
                return responseReturn(res, 400, { message: 'Banner image is required' })
            }

            cloudinary.config({
                cloud_name: process.env.CLOUD_NAME,
                api_key: process.env.API_KEY,
                api_secret: process.env.API_SECRET,
                secure: true
            })

            try {
                let banner = await bannerModel.findById(bannerId)
                if (!banner) {
                    return responseReturn(res, 404, { message: 'Banner not found' })
                }

                const publicId = getCloudinaryPublicId(banner.banner)
                if (publicId) {
                    await cloudinary.uploader.destroy(publicId)
                }

                const { url } = await cloudinary.uploader.upload(image.filepath, { folder: 'banners' })

                await bannerModel.findByIdAndUpdate(bannerId, {
                    banner: url
                })

                banner = await bannerModel.findById(bannerId)

                responseReturn(res, 200, { banner, message: "banner update success" })

            } catch (error) {
                console.log(error)
                responseReturn(res, 500, { message: error.message })
            }
        })
    }

    delete_banner = async (req, res) => {
        if (req.role !== 'admin') {
            return responseReturn(res, 401, { message: 'unauthorized' })
        }

        const { bannerId } = req.params

        if (!bannerId || !ObjectId.isValid(bannerId)) {
            return responseReturn(res, 400, { message: 'Valid bannerId required' })
        }

       cloudinary.config({
            cloud_name: process.env.CLOUD_NAME,
            api_key: process.env.API_KEY,
            api_secret: process.env.API_SECRET,
            secure: true
        })

        try {
            const banner = await bannerModel.findById(bannerId)
            if (!banner) {
                return responseReturn(res, 404, { message: 'Banner not found' })
            }

            const publicId = getCloudinaryPublicId(banner.banner)
            if (publicId) {
                await cloudinary.uploader.destroy(publicId)
            }

            await bannerModel.findByIdAndDelete(bannerId)

            responseReturn(res, 200, { message: 'banner delete success', bannerId })
        } catch (error) {
            console.log(error)
            responseReturn(res, 500, { message: error.message })
        }
    }
}

module.exports = new bannerController()
