const cloudinary = require('cloudinary').v2
require('dotenv').config()
let isConfigured = false

const configureCloudinary = () => {
    if (!isConfigured) {
        cloudinary.config({
            cloud_name: process.env.CLOUD_NAME,
            api_key: process.env.API_KEY,
            api_secret: process.env.API_SECRET,
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
