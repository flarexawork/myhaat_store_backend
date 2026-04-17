const categoryModel = require('../../models/categoryModel')
const { responseReturn } = require('../../utiles/response')
const cloudinary = require('cloudinary').v2
const formidable = require('formidable')
const { mongo: { ObjectId } } = require('mongoose')

const getFormValue = (value) => Array.isArray(value) ? value[0] : value
const getFormFile = (value) => Array.isArray(value) ? value[0] : value

const getCloudinaryPublicId = (url = '') => {
    if (!url) return null

    const parts = url.split('/')
    const uploadIndex = parts.findIndex((part) => part === 'upload')
    if (uploadIndex === -1) return null

    let publicIdParts = parts.slice(uploadIndex + 1)
    if (publicIdParts[0] && publicIdParts[0].startsWith('v')) {
        publicIdParts = publicIdParts.slice(1)
    }

    if (!publicIdParts.length) return null
    return publicIdParts.join('/').replace(/\.[^/.]+$/, '')
}

const configureCloudinary = () => cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET,
    secure: true
})

class categoryController {

    add_category = async (req, res) => {
        const form = formidable({})
        form.parse(req, async (err, fields, files) => {
            if (err) {
                responseReturn(res, 404, { error: 'Something went wrong. Please try again later.' })
            } else {
                let name = getFormValue(fields.name)
                const image = getFormFile(files.image)

                if (!name || !image) {
                    return responseReturn(res, 400, { error: 'Please provide both a name and an image.' })
                }

                name = name.trim()
                const slug = name.split(' ').join('-')

                configureCloudinary()

                try {
                    const result = await cloudinary.uploader.upload(image.filepath, { folder: 'categorys' })

                    if (result) {
                        const category = await categoryModel.create({
                            name,
                            slug,
                            image: result.secure_url
                        })
                        responseReturn(res, 201, { category, message: 'category add success' })
                    } else {
                        responseReturn(res, 404, { error: 'We could not upload the image. Please try again.' })
                    }
                } catch (error) {
                    responseReturn(res, 500, { error: 'Something went wrong. Please try again later.' })
                }

            }
        })
    }

    update_category = async (req, res) => {
        if (req.role !== 'admin') {
            return responseReturn(res, 401, { message: 'You are not authorized to perform this action.' })
        }

        const { categoryId } = req.params
        if (!categoryId || !ObjectId.isValid(categoryId)) {
            return responseReturn(res, 400, { error: 'A valid category is required.' })
        }

        const form = formidable({})
        form.parse(req, async (err, fields, files) => {
            if (err) {
                return responseReturn(res, 400, { error: 'We could not update the category. Please try again.' })
            }

            const image = getFormFile(files.image)
            const nameValue = getFormValue(fields.name)

            try {
                const category = await categoryModel.findById(categoryId)
                if (!category) {
                    return responseReturn(res, 404, { error: 'The requested category could not be found.' })
                }

                const name = (nameValue ? nameValue.trim() : category.name)
                if (!name) {
                    return responseReturn(res, 400, { error: 'Category name is required.' })
                }

                const payload = {
                    name,
                    slug: name.split(' ').join('-')
                }

                if (image) {
                    configureCloudinary()

                    const publicId = getCloudinaryPublicId(category.image)
                    if (publicId) {
                        await cloudinary.uploader.destroy(publicId)
                    }

                    const result = await cloudinary.uploader.upload(image.filepath, { folder: 'categorys' })
                    payload.image = result.secure_url
                }

                const updatedCategory = await categoryModel.findByIdAndUpdate(categoryId, payload, { new: true })
                return responseReturn(res, 200, {
                    category: updatedCategory,
                    message: 'category update success'
                })
            } catch (error) {
                console.log(error.message)
                return responseReturn(res, 500, { error: 'Something went wrong. Please try again later.' })
            }
        })
    }

    delete_category = async (req, res) => {
        if (req.role !== 'admin') {
            return responseReturn(res, 401, { message: 'You are not authorized to perform this action.' })
        }

        const { categoryId } = req.params
        if (!categoryId || !ObjectId.isValid(categoryId)) {
            return responseReturn(res, 400, { error: 'A valid category is required.' })
        }

        configureCloudinary()

        try {
            const category = await categoryModel.findById(categoryId)
            if (!category) {
                return responseReturn(res, 404, { error: 'The requested category could not be found.' })
            }

            const publicId = getCloudinaryPublicId(category.image)
            if (publicId) {
                await cloudinary.uploader.destroy(publicId)
            }

            await categoryModel.findByIdAndDelete(categoryId)

            return responseReturn(res, 200, {
                categoryId,
                message: 'category delete success'
            })
        } catch (error) {
            console.log(error.message)
            return responseReturn(res, 500, { error: 'Something went wrong. Please try again later.' })
        }
    }

    get_category = async (req, res) => {
        const { page, searchValue, parPage } = req.query
        try {
            let skipPage = ''
            if (parPage && page) {
                skipPage = parseInt(parPage) * (parseInt(page) - 1)
            }
            if (searchValue && page && parPage) {
                const categorys = await categoryModel.find({
                    $text: { $search: searchValue }
                }).skip(skipPage).limit(parPage).sort({ createdAt: -1 })
                const totalCategory = await categoryModel.find({
                    $text: { $search: searchValue }
                }).countDocuments()
                responseReturn(res, 200, { totalCategory, categorys })
            }
            else if (searchValue === '' && page && parPage) {
                const categorys = await categoryModel.find({}).skip(skipPage).limit(parPage).sort({ createdAt: -1 })
                const totalCategory = await categoryModel.find({}).countDocuments()
                responseReturn(res, 200, { totalCategory, categorys })
            }
            else {
                const categorys = await categoryModel.find({}).sort({ createdAt: -1 })
                const totalCategory = await categoryModel.find({}).countDocuments()
                responseReturn(res, 200, { totalCategory, categorys })
            }
        } catch (error) {
            console.log(error.message)
        }
    }
}

module.exports = new categoryController()
