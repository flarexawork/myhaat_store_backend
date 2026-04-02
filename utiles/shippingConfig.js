const Settings = require('../models/settingsModel')

const normalizeShippingFee = (value) => {
    const shippingFee = Number(value)
    return Number.isFinite(shippingFee) && shippingFee > 0 ? shippingFee : 0
}

const getShippingSettings = async () => {
    return await Settings.getSettings()
}

const getShippingFee = async () => {
    const settings = await getShippingSettings()
    return normalizeShippingFee(settings.shipping_fee)
}

const getOrderShippingFee = async (groupCount = 1) => {
    const shippingFee = await getShippingFee()
    const normalizedGroupCount = Number(groupCount)
    const safeGroupCount = Number.isFinite(normalizedGroupCount) && normalizedGroupCount > 0
        ? normalizedGroupCount
        : 0

    return shippingFee * safeGroupCount
}

module.exports = {
    getShippingSettings,
    getShippingFee,
    getOrderShippingFee,
    normalizeShippingFee
}
