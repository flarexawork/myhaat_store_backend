const jwt = require('jsonwebtoken')

const getRefreshSecret = () => process.env.REFRESH_SECRET || process.env.SECRET

module.exports.createToken = async (data, options = {}) => {
    const token = await jwt.sign(data, process.env.SECRET, {
        expiresIn: options.expiresIn || '7d'
    })

    return token
}

module.exports.createAccessToken = async (data) => {
    return jwt.sign(data, process.env.SECRET, { expiresIn: '15m' })
}

module.exports.createRefreshToken = async (data) => {
    return jwt.sign(data, getRefreshSecret(), { expiresIn: '7d' })
}

module.exports.verifyRefreshToken = async (token) => {
    return jwt.verify(token, getRefreshSecret())
}
