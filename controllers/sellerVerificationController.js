const sellerModel = require('../models/sellerModel')
const { responseReturn } = require('../utiles/response')
const { uploadManyToCloudinary, uploadToCloudinary } = require('../utiles/cloudinary')
const {
    ACCOUNT_STATUS,
    VERIFICATION_STATUS,
    normalizeVerificationMedia,
    validateIdentityDocument
} = require('../utiles/sellerVerification')

const getFirstValue = (value) => Array.isArray(value) ? value[0] : value

const pickField = (fields, aliases) => {
    for (const alias of aliases) {
        const value = getFirstValue(fields[alias])

        if (typeof value === 'string' && value.trim()) {
            return value.trim()
        }
    }

    return ''
}

class sellerVerificationController {
    complete_verification = async (req, res) => {
        if (req.role !== 'seller') {
            return responseReturn(res, 403, { error: 'Only sellers can complete verification' })
        }

        const { fields = {}, files = {} } = req.sellerVerificationForm || {}
        const shopName = pickField(fields, ['shopName', 'shopDetails.shopName', 'shopDetails[shopName]'])
        const division = pickField(fields, ['division', 'shopDetails.division', 'shopDetails[division]'])
        const district = pickField(fields, ['district', 'shopDetails.district', 'shopDetails[district]'])
        const subDistrict = pickField(fields, ['subDistrict', 'sub_district', 'shopDetails.subDistrict', 'shopDetails[subDistrict]'])
        const fullName = pickField(fields, ['fullName', 'identityDetails.fullName', 'identityDetails[fullName]'])
        const address = pickField(fields, ['address', 'identityDetails.address', 'identityDetails[address]'])
        const documentType = pickField(fields, ['documentType', 'identityDetails.documentType', 'identityDetails[documentType]'])
        const documentNumber = pickField(fields, ['documentNumber', 'identityDetails.documentNumber', 'identityDetails[documentNumber]'])

        const image = files.image || null
        const shopImages = files.shopImages || []
        const documentImages = files.documentImages || []

        if (!shopName || !division || !district || !subDistrict || !fullName || !address || !documentType || !documentNumber) {
            return responseReturn(res, 400, { error: 'All shop and identity details are required' })
        }

        if (shopImages.length === 0 || documentImages.length === 0) {
            return responseReturn(res, 400, { error: 'Shop images and document images are required' })
        }

        const validation = validateIdentityDocument(documentType, documentNumber)

        if (validation.error) {
            return responseReturn(res, 400, { error: validation.error })
        }

        try {
            const seller = await sellerModel.findById(req.id)

            if (!seller) {
                return responseReturn(res, 404, { error: 'Seller not found' })
            }

            if (!seller.image && !image) {
                return responseReturn(res, 400, { error: 'Profile image is required' })
            }

            const [uploadedProfileImage, uploadedShopImages, uploadedDocumentImages] = await Promise.all([
                image ? uploadToCloudinary(image.filepath, 'profile') : Promise.resolve(null),
                uploadManyToCloudinary(shopImages, 'shop'),
                uploadManyToCloudinary(documentImages, 'documents')
            ])

            const shopImageUrls = uploadedShopImages.map((item) => item.secure_url)
            const documentImageUrls = uploadedDocumentImages.map((item) => item.secure_url)

            const sellerUpdate = {
                shopInfo: {
                    shopName,
                    division,
                    district,
                    sub_district: subDistrict
                },
                shopDetails: {
                    shopName,
                    division,
                    district,
                    subDistrict,
                    shopImage: shopImageUrls[0] || '',
                    shopImages: shopImageUrls
                },
                identityDetails: {
                    fullName,
                    address,
                    documentType: validation.documentType,
                    documentNumber: validation.documentNumber,
                    documentImage: documentImageUrls[0] || '',
                    documentImages: documentImageUrls
                },
                image: uploadedProfileImage?.secure_url || seller.image,
                verificationStatus: VERIFICATION_STATUS.PENDING_ADMIN,
                accountStatus: ACCOUNT_STATUS.INACTIVE,
                adminRemark: '',
                status: 'pending'
            }

            const updatedSeller = await sellerModel.findByIdAndUpdate(
                req.id,
                sellerUpdate,
                { new: true }
            )

            return responseReturn(res, 200, {
                message: 'Verification details submitted successfully',
                seller: updatedSeller ? normalizeVerificationMedia(updatedSeller.toObject()) : null
            })
        } catch (error) {
            return responseReturn(res, 500, { error: error.message })
        }
    }
}

module.exports = new sellerVerificationController()
