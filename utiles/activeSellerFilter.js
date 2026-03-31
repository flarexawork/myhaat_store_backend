const sellerModel = require('../models/sellerModel');

/**
 * Get IDs of all active sellers
 * @returns {Promise<Array>} Array of active seller IDs
 */
const getActiveSellers = async () => {
    try {
        const activeSellers = await sellerModel.find({ status: 'active' }).select('_id');
        return activeSellers.map(seller => seller._id);
    } catch (error) {
        console.error('Error fetching active sellers:', error.message);
        return [];
    }
};

module.exports = { getActiveSellers };
