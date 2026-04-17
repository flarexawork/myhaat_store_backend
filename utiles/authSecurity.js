const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/

const normalizeEmail = (email = '') => email.trim().toLowerCase()

const normalizeText = (value = '') => value.toString().trim()

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const isStrongPassword = (password = '') => PASSWORD_REGEX.test(password)

const getStrongPasswordMessage = () => 'Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.'

const getClientIp = (req) => {
    const forwardedFor = req.headers['x-forwarded-for']

    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
        return forwardedFor[0]
    }

    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        return forwardedFor.split(',')[0].trim()
    }

    return req.ip || req.socket?.remoteAddress || 'Unavailable'
}

const getClientDevice = (req) => normalizeText(req.headers['user-agent'] || 'Unknown device')

const hasPasswordChangedAfter = (passwordChangedAt, tokenIssuedAt) => {
    if (!passwordChangedAt || !tokenIssuedAt) {
        return false
    }

    return Math.floor(new Date(passwordChangedAt).getTime() / 1000) > tokenIssuedAt
}

const getAdminPrivilegeRole = (admin) => {
    const explicitAdminRole = normalizeText(admin?.adminRole)
    if (explicitAdminRole === 'super_admin' || explicitAdminRole === 'super-admin') {
        return 'super_admin'
    }

    const email = normalizeEmail(admin?.email || '')
    const superAdminEmail = normalizeEmail(process.env.SUPER_ADMIN_EMAIL || 'superadmin@gmail.com')

    return email === superAdminEmail ? 'super_admin' : 'admin'
}

module.exports = {
    escapeRegex,
    getAdminPrivilegeRole,
    getClientDevice,
    getClientIp,
    getStrongPasswordMessage,
    hasPasswordChangedAfter,
    isStrongPassword,
    normalizeEmail,
    normalizeText
}
