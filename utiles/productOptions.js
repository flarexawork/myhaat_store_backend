const normalizePincode = (value) => String(value || '').trim()

const normalizePincodes = (value) => {
    const rawItems = Array.isArray(value)
        ? value
        : String(value || '').split(/[,\n\r\t ]+/)

    const normalized = rawItems
        .map(normalizePincode)
        .filter(Boolean)

    return [...new Set(normalized)]
}

const validatePincode = (value) => /^\d{6}$/.test(normalizePincode(value))

const parseJsonField = (value, fallback) => {
    if (value === undefined || value === null || value === '') return fallback
    const raw = Array.isArray(value) ? value[0] : value
    if (typeof raw !== 'string') return raw

    try {
        return JSON.parse(raw)
    } catch (error) {
        return fallback
    }
}

const normalizeOptionValue = (value) => String(value || '').trim()

const makeVariantKey = (attributes = []) => {
    return [...attributes]
        .map((item) => ({
            name: normalizeOptionValue(item.name),
            value: normalizeOptionValue(item.value)
        }))
        .filter((item) => item.name && item.value)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => `${item.name}:${item.value}`)
        .join('|')
}

const normalizeProductVariations = (variations = []) => {
    if (!Array.isArray(variations)) return []

    return variations
        .map((variation, index) => {
            const name = normalizeOptionValue(variation.name)
            const selectedOptions = Array.isArray(variation.selectedOptions)
                ? variation.selectedOptions
                : []

            return {
                name,
                label: normalizeOptionValue(variation.label || variation.name),
                required: variation.required !== false,
                sortOrder: Number(variation.sortOrder || index),
                selectedOptions: selectedOptions
                    .map((option, optionIndex) => ({
                        label: normalizeOptionValue(option.label || option.value),
                        value: normalizeOptionValue(option.value || option.label),
                        group: normalizeOptionValue(option.group),
                        sortOrder: Number(option.sortOrder || optionIndex)
                    }))
                    .filter((option) => option.value)
            }
        })
        .filter((variation) => variation.name && variation.selectedOptions.length)
}

const normalizeVariantCombinations = (combinations = [], productStock = 0) => {
    if (!Array.isArray(combinations)) return []

    const seen = new Set()

    return combinations
        .map((combination) => {
            const attributes = Array.isArray(combination.attributes) ? combination.attributes : []
            const variantKey = makeVariantKey(attributes)

            return {
                variantKey,
                sku: normalizeOptionValue(combination.sku),
                stock: Number.isFinite(Number(combination.stock)) ? Number(combination.stock) : Number(productStock || 0),
                price: Number.isFinite(Number(combination.price)) && Number(combination.price) > 0 ? Number(combination.price) : null,
                isActive: combination.isActive !== false,
                attributes: attributes
                    .map((attribute) => ({
                        name: normalizeOptionValue(attribute.name),
                        label: normalizeOptionValue(attribute.label || attribute.name),
                        value: normalizeOptionValue(attribute.value),
                        optionLabel: normalizeOptionValue(attribute.optionLabel || attribute.value)
                    }))
                    .filter((attribute) => attribute.name && attribute.value)
            }
        })
        .filter((combination) => {
            if (!combination.variantKey || seen.has(combination.variantKey)) return false
            seen.add(combination.variantKey)
            return true
        })
}

const productHasVariations = (product) => {
    return Array.isArray(product?.variations) && product.variations.length > 0
}

const validateSelectedVariation = (product, selectedVariation = {}) => {
    if (!productHasVariations(product)) {
        return { valid: true, selectedVariation: null }
    }

    const variantKey = normalizeOptionValue(selectedVariation.variantKey)
    const activeVariants = (product.variantCombinations || []).filter((item) => item.isActive !== false)
    const variant = activeVariants.find((item) => item.variantKey === variantKey)

    if (!variant) {
        return { valid: false, message: 'Please select an available product variation.' }
    }

    const selectedNames = new Set((variant.attributes || []).map((item) => item.name))
    const missing = (product.variations || []).find((variation) => variation.required !== false && !selectedNames.has(variation.name))

    if (missing) {
        return { valid: false, message: `Please select ${missing.label || missing.name}.` }
    }

    return {
        valid: true,
        selectedVariation: {
            variantKey: variant.variantKey,
            sku: variant.sku || '',
            attributes: variant.attributes || []
        },
        variant
    }
}

const isProductDeliverableToPincode = (product, pincode) => {
    const normalized = normalizePincode(pincode)
    if (!validatePincode(normalized)) {
        return { valid: false, available: false, message: 'Please enter a valid 6-digit pincode.' }
    }

    const configuredPincodes = Array.isArray(product?.deliveryPincodes) ? product.deliveryPincodes : []
    if (!configuredPincodes.length) {
        return { valid: true, available: true, message: 'Delivery available.' }
    }

    const available = configuredPincodes.includes(normalized)
    return {
        valid: true,
        available,
        message: available ? 'Delivery available.' : 'Delivery is not available to this pincode.'
    }
}

module.exports = {
    isProductDeliverableToPincode,
    makeVariantKey,
    normalizePincodes,
    normalizeProductVariations,
    normalizeVariantCombinations,
    parseJsonField,
    validatePincode,
    validateSelectedVariation
}
