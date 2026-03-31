const jwt = require('jsonwebtoken');
const adminModel = require('../models/adminModel');
const customerModel = require('../models/customerModel');
const sellerModel = require('../models/sellerModel');
const { getAdminPrivilegeRole, hasPasswordChangedAfter } = require('../utiles/authSecurity');

const ALLOWED_INACTIVE_SELLER_ROUTES = [
    { method: 'GET', path: '/api/get-user' },
    { method: 'GET', path: '/api/seller/profile' },
    { method: 'POST', path: '/api/seller/complete-verification' }
]

const isAllowedInactiveSellerRoute = (req) => {
    const requestPath = (req.originalUrl || '').split('?')[0]

    return ALLOWED_INACTIVE_SELLER_ROUTES.some((route) => {
        return route.method === req.method && route.path === requestPath
    })
}

module.exports.authMiddleware = async (req, res, next) => {
    const { authorization } = req.headers

    if (authorization) {
        const token = authorization.split(' ')[1]
        if (token) {
            try {
                const userInfo = await jwt.verify(token, process.env.SECRET)
                req.tokenRole = userInfo.role
                req.role = userInfo.role === 'super_admin' ? 'admin' : userInfo.role
                req.id = userInfo.id

                if (req.role === 'seller') {
                    const seller = await sellerModel.findById(req.id).select('accountStatus adminRemark status passwordChangedAt')

                    if (!seller) {
                        return res.status(401).json({ message: 'unauthorized' })
                    }

                    if (hasPasswordChangedAfter(seller.passwordChangedAt, userInfo.iat)) {
                        return res.status(401).json({ message: 'Session expired. Please login again.' })
                    }

                    const accountStatus = seller.accountStatus || (seller.status === 'deactive' ? 'inactive' : 'active')

                    if (accountStatus === 'inactive' && !isAllowedInactiveSellerRoute(req)) {
                        return res.status(403).json({
                            error: 'ACCOUNT_DEACTIVATED',
                            remark: seller.adminRemark || ''
                        })
                    }
                }

                if (req.role === 'admin') {
                    const admin = await adminModel.findById(req.id).select('email adminRole role passwordChangedAt')

                    if (!admin) {
                        return res.status(401).json({ message: 'unauthorized' })
                    }

                    if (hasPasswordChangedAfter(admin.passwordChangedAt, userInfo.iat)) {
                        return res.status(401).json({ message: 'Session expired. Please login again.' })
                    }

                    req.adminRole = getAdminPrivilegeRole(admin)
                }

                if (req.role === 'customer') {
                    const customer = await customerModel.findById(req.id).select('passwordChangedAt')

                    if (!customer) {
                        return res.status(401).json({ message: 'unauthorized' })
                    }

                    if (hasPasswordChangedAfter(customer.passwordChangedAt, userInfo.iat)) {
                        return res.status(401).json({ message: 'Session expired. Please login again.' })
                    }
                }

                next()
            } catch (error) {
                return res.status(401).json({ message: 'unauthorized' })
            }
        } else {
            return res.status(401).json({ message: 'unauthorized' })
        }
    } else {
        return res.status(401).json({ message: 'unauthorized' })
    }

}
