const cloudinary = require('cloudinary').v2

let isConfigured = false

const configureCloudinary = () => {
    if (!isConfigured) {
        cloudinary.config({
            CLOUD_NAME: process.env.CLOUD_NAME,
            API_KEY: process.env.API_KEY,
            API_SECRET: process.env.API_SECRET,
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
