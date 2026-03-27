const VERIFICATION_STATUS = Object.freeze({
    PENDING_DETAILS: 'pending_details',
    PENDING_ADMIN: 'pending_admin',
    APPROVED: 'approved'
})

const ACCOUNT_STATUS = Object.freeze({
    ACTIVE: 'active',
    INACTIVE: 'inactive'
})

const DOCUMENT_TYPES = Object.freeze({
    AADHAAR: 'aadhaar',
    PAN: 'pan'
})

const FORMATTED_AADHAAR_REGEX = /^[0-9]{4}-[0-9]{4}-[0-9]{4}$/
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/

const normalizeVerificationStatus = (value = '') => {
    const normalized = String(value).trim().toLowerCase()

    if (Object.values(VERIFICATION_STATUS).includes(normalized)) {
        return normalized
    }

    return VERIFICATION_STATUS.PENDING_DETAILS
}

const getEffectiveVerificationStatus = (seller = {}) => {
    return normalizeVerificationStatus(seller?.verificationStatus)
}

const normalizeAccountStatus = (seller = {}) => {
    const accountStatus = String(seller?.accountStatus || '').trim().toLowerCase()

    if (Object.values(ACCOUNT_STATUS).includes(accountStatus)) {
        return accountStatus
    }

    if (seller?.status === 'deactive') {
        return ACCOUNT_STATUS.INACTIVE
    }

    return ACCOUNT_STATUS.ACTIVE
}

const normalizeAdminRemark = (seller = {}) => {
    return typeof seller?.adminRemark === 'string' ? seller.adminRemark : ''
}

const getSellerVerificationFlags = (seller = {}) => {
    const verificationStatus = getEffectiveVerificationStatus(seller)
    const accountStatus = normalizeAccountStatus(seller)

    return {
        verificationStatus,
        accountStatus,
        adminRemark: normalizeAdminRemark(seller),
        requiresVerification: verificationStatus === VERIFICATION_STATUS.PENDING_DETAILS,
        waitingApproval: verificationStatus === VERIFICATION_STATUS.PENDING_ADMIN
    }
}

const normalizeVerificationMedia = (sellerData = {}) => {
    const normalizedSellerData = {
        ...sellerData,
        shopDetails: {
            ...(sellerData.shopDetails || {})
        },
        identityDetails: {
            ...(sellerData.identityDetails || {})
        }
    }

    const existingShopImages = normalizedSellerData.shopDetails.shopImages
    const existingDocumentImages = normalizedSellerData.identityDetails.documentImages

    normalizedSellerData.shopDetails.shopImages =
        Array.isArray(existingShopImages) && existingShopImages.length > 0
            ? existingShopImages
            : (normalizedSellerData.shopDetails.shopImage ? [normalizedSellerData.shopDetails.shopImage] : [])

    normalizedSellerData.identityDetails.documentImages =
        Array.isArray(existingDocumentImages) && existingDocumentImages.length > 0
            ? existingDocumentImages
            : (normalizedSellerData.identityDetails.documentImage ? [normalizedSellerData.identityDetails.documentImage] : [])

    return normalizedSellerData
}

const validateIdentityDocument = (documentType = '', documentNumber = '') => {
    const normalizedDocumentType = String(documentType).trim().toLowerCase()
    const trimmedNumber = String(documentNumber).trim()
    const normalizedDocumentNumber =
        normalizedDocumentType === DOCUMENT_TYPES.PAN
            ? trimmedNumber.toUpperCase()
            : trimmedNumber

    if (!Object.values(DOCUMENT_TYPES).includes(normalizedDocumentType)) {
        return { error: 'Document type must be either aadhaar or pan' }
    }

    if (normalizedDocumentType === DOCUMENT_TYPES.AADHAAR && !FORMATTED_AADHAAR_REGEX.test(normalizedDocumentNumber)) {
        return { error: 'Invalid Aadhaar format (xxxx-xxxx-xxxx)' }
    }

    if (normalizedDocumentType === DOCUMENT_TYPES.PAN && !PAN_REGEX.test(normalizedDocumentNumber)) {
        return { error: 'Invalid PAN format' }
    }

    return {
        documentType: normalizedDocumentType,
        documentNumber:
            normalizedDocumentType === DOCUMENT_TYPES.AADHAAR
                ? normalizedDocumentNumber.replace(/-/g, '')
                : normalizedDocumentNumber
    }
}

module.exports = {
    ACCOUNT_STATUS,
    VERIFICATION_STATUS,
    DOCUMENT_TYPES,
    normalizeAccountStatus,
    normalizeAdminRemark,
    getEffectiveVerificationStatus,
    getSellerVerificationFlags,
    normalizeVerificationMedia,
    validateIdentityDocument
}
