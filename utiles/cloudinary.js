const cloudinary = require('cloudinary').v2

let isConfigured = false

const configureCloudinary = () => {
    if (!isConfigured) {
        cloudinary.config({
            cloud_name: process.env.cloud_name,
            api_key: process.env.api_key,
            api_secret: process.env.api_secret,
            secure: true
        })
        isConfigured = true
    }

    return cloudinary
}

const uploadToCloudinary = async (filepath, folder) => {
    const client = configureCloudinary()
    return client.uploader.upload(filepath, { folder })
}

const uploadManyToCloudinary = async (files = [], folder) => {
    return Promise.all(files.map((file) => uploadToCloudinary(file.filepath, folder)))
}

module.exports = {
    configureCloudinary,
    uploadToCloudinary,
    uploadManyToCloudinary
}
