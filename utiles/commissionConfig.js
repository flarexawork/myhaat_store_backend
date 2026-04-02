/**
 * Commission configuration utility (DB-backed).
 * 
 * Reads commission settings from the commission_settings collection.
 * Falls back to 0% commission if no settings exist or on error.
 * 
 * Usage:
 *   const { getCommissionSettings } = require('./commissionConfig')
 *   const settings = await getCommissionSettings()
 *   // settings.commission_percent → Number (0-100)
 */

const CommissionSettings = require('../models/commissionSettingsModel')

/**
 * Returns the full commission settings object from DB.
 * Safe fallback: { commission_percent: 0 }
 */
const getCommissionSettings = async () => {
    return await CommissionSettings.getSettings()
}

/**
 * Returns just the commission percent (Number).
 * Safe fallback: 0
 */
const getCommissionPercent = async () => {
    const settings = await getCommissionSettings()
    return settings.commission_percent
}

module.exports = { getCommissionSettings, getCommissionPercent }
