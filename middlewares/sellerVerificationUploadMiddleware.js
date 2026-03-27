const formidable = require('formidable')
const { responseReturn } = require('../utiles/response')

const MAX_FILE_SIZE = 2 * 1024 * 1024
const MAX_FILES_PER_FIELD = 5
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const toArray = (value) => {
    if (!value) {
        return []
    }

    return Array.isArray(value) ? value : [value]
}

const getFilesByAliases = (files, aliases) => {
    return aliases.reduce((allFiles, alias) => {
        return [...allFiles, ...toArray(files[alias])]
    }, [])
}

const getSingleFileByAliases = (files, aliases) => {
    for (const alias of aliases) {
        const file = toArray(files[alias])[0]

        if (file) {
            return file
        }
    }

    return null
}

const validateFiles = (files = []) => {
    for (const file of files) {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            return 'Only JPG, PNG, WEBP allowed'
        }

        if (file.size > MAX_FILE_SIZE) {
            return 'File size must be under 2MB'
        }
    }

    return null
}

module.exports.sellerVerificationUploadMiddleware = (req, res, next) => {
    const form = formidable({
        multiples: true,
        allowEmptyFiles: false,
        maxFileSize: MAX_FILE_SIZE
    })

    form.parse(req, (err, fields, files) => {
        if (err) {
            if (String(err.message || '').toLowerCase().includes('maxfilesize')) {
                return responseReturn(res, 400, { error: 'File size must be under 2MB' })
            }

            return responseReturn(res, 400, { error: err.message })
        }

        const image = getSingleFileByAliases(files, ['image', 'profileImage'])
        const shopImages = getFilesByAliases(files, ['shopImages', 'shopImage', 'shopDetails.shopImages', 'shopDetails[shopImages]'])
        const documentImages = getFilesByAliases(files, ['documentImages', 'documentImage', 'identityDetails.documentImages', 'identityDetails[documentImages]'])

        if (shopImages.length > MAX_FILES_PER_FIELD || documentImages.length > MAX_FILES_PER_FIELD) {
            return responseReturn(res, 400, { error: 'Maximum 5 images allowed per field' })
        }

        const fileValidationError = validateFiles([
            ...(image ? [image] : []),
            ...shopImages,
            ...documentImages
        ])

        if (fileValidationError) {
            return responseReturn(res, 400, { error: fileValidationError })
        }

        req.sellerVerificationForm = {
            fields,
            files: {
                image,
                shopImages,
                documentImages
            }
        }

        next()
    })
}
