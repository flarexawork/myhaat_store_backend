const cardModel = require('../../models/cardModel')
const wishlistModel = require('../../models/wishlistModel')
const productModel = require('../../models/productModel')
const {
    responseReturn
} = require('../../utiles/response')
const {
    mongo: {
        ObjectId
    }
} = require('mongoose')
const { getActiveSellers } = require('../../utiles/activeSellerFilter')
const { getOrderShippingFee } = require('../../utiles/shippingConfig')
const { getDiscountedUnitPrice } = require('../../utiles/orderFinancials')
const { validateSelectedVariation } = require('../../utiles/productOptions')
class cardController {
    add_to_card = async (req, res) => {
        const {
            userId,
            productId,
            quantity,
            selectedVariation
        } = req.body
        try {
            const productInfo = await productModel.findById(productId)

            if (!productInfo) {
                return responseReturn(res, 404, {
                    error: 'The requested product could not be found.'
                })
            }

            const variationValidation = validateSelectedVariation(productInfo, selectedVariation)
            if (!variationValidation.valid) {
                return responseReturn(res, 400, {
                    error: variationValidation.message
                })
            }

            const resolvedVariantKey = variationValidation.selectedVariation?.variantKey || ''
            const availableStock = variationValidation.variant?.stock ?? productInfo.stock
            if (Number(quantity) > Number(availableStock)) {
                return responseReturn(res, 400, {
                    error: 'Selected quantity is not available for this product.'
                })
            }

            const product = await cardModel.findOne({
                $and: [{
                        productId: {
                            $eq: productId
                        }
                    },
                    {
                        userId: {
                            $eq: userId
                        }
                    },
                    {
                        variantKey: {
                            $eq: resolvedVariantKey
                        }
                    }
                ]
            })
            if (product) {
                responseReturn(res, 404, {
                    error: 'This item is already in your cart.'
                })
            } else {
                const product = await cardModel.create({
                    userId,
                    productId,
                    quantity,
                    selectedVariation: variationValidation.selectedVariation,
                    variantKey: resolvedVariantKey
                })
                responseReturn(res, 201, {
                    message: 'Add to card success',
                    product
                })
            }
        } catch (error) {
            console.log(error.message)
        }
    }
    get_card_products = async (req, res) => {
        const {
            userId
        } = req.params
        try {
            const activeSellers = await getActiveSellers();
            const card_products = await cardModel.aggregate([{
                    $match: {
                        userId: {
                            $eq: new ObjectId(userId)
                        }
                    }
                },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'productId',
                        foreignField: "_id",
                        as: 'products'
                    }
                },
                {
                    $match: {
                        'products.0.sellerId': { $in: activeSellers }
                    }
                }
            ])
            let buy_product_item = 0
            let calculatePrice = 0;
            let card_product_count = 0;
            const outOfStockProduct = card_products.filter(p => {
                const variant = (p.products[0].variantCombinations || []).find(v => v.variantKey === p.variantKey)
                const stock = variant?.stock ?? p.products[0].stock
                return stock < p.quantity
            })
            for (let i = 0; i < outOfStockProduct.length; i++) {
                card_product_count = card_product_count + outOfStockProduct[i].quantity
            }
            const stockProduct = card_products.filter(p => {
                const variant = (p.products[0].variantCombinations || []).find(v => v.variantKey === p.variantKey)
                const stock = variant?.stock ?? p.products[0].stock
                return stock >= p.quantity
            })
            for (let i = 0; i < stockProduct.length; i++) {
                const {
                    quantity
                } = stockProduct[i]
                card_product_count = card_product_count + quantity
                buy_product_item = buy_product_item + quantity
                const variant = (stockProduct[i].products[0].variantCombinations || []).find(v => v.variantKey === stockProduct[i].variantKey)
                const pricedProduct = {
                    ...stockProduct[i].products[0],
                    price: variant?.price || stockProduct[i].products[0].price
                }
                const discountedPrice = getDiscountedUnitPrice(pricedProduct)
                calculatePrice = calculatePrice + quantity * discountedPrice
            }
            let p = []
            let unique = [...new Set(stockProduct.map(p => p.products[0].sellerId.toString()))]
            for (let i = 0; i < unique.length; i++) {
                let price = 0;
                for (let j = 0; j < stockProduct.length; j++) {
                    const tempProduct = stockProduct[j].products[0]
                    if (unique[i] === tempProduct.sellerId.toString()) {
                        const variant = (tempProduct.variantCombinations || []).find(v => v.variantKey === stockProduct[j].variantKey)
                        const productInfo = {
                            ...tempProduct,
                            price: variant?.price || tempProduct.price
                        }
                        const pri = getDiscountedUnitPrice(productInfo)
                        price = price + pri * stockProduct[j].quantity
                        p[i] = {
                            sellerId: unique[i],
                            shopName: tempProduct.shopName,
                            price,
                            products: p[i] ? [
                                ...p[i].products,
                                {
                                    _id: stockProduct[j]._id,
                                    quantity: stockProduct[j].quantity,
                                    selectedVariation: stockProduct[j].selectedVariation,
                                    variantKey: stockProduct[j].variantKey,
                                    productInfo
                                }
                            ] : [{
                                _id: stockProduct[j]._id,
                                quantity: stockProduct[j].quantity,
                                selectedVariation: stockProduct[j].selectedVariation,
                                variantKey: stockProduct[j].variantKey,
                                productInfo

                            }]
                        }
                    }

                }
            }
            const shipping_fee = await getOrderShippingFee(p.length)
            responseReturn(res, 200, {
                card_products: p,
                price: calculatePrice,
                card_product_count,
                shipping_fee,
                outOfStockProduct,
                buy_product_item
            })

        } catch (error) {
            console.log(error.message)
        }
    }

    delete_card_product = async (req, res) => {
        const {
            card_id
        } = req.params
        try {
            await cardModel.findByIdAndDelete(card_id)
            responseReturn(res, 200, {
                message: 'success'
            })
        } catch (error) {
            console.log(error.message)
        }
    }
    quantity_inc = async (req, res) => {
        const {
            card_id
        } = req.params
        try {
            const product = await cardModel.findById(card_id)
            const {
                quantity
            } = product
            const productInfo = await productModel.findById(product.productId)
            const variant = (productInfo?.variantCombinations || []).find(v => v.variantKey === product.variantKey)
            const availableStock = variant?.stock ?? productInfo?.stock ?? quantity

            if (quantity + 1 > availableStock) {
                return responseReturn(res, 400, {
                    error: 'Selected quantity is not available for this product.'
                })
            }

            await cardModel.findByIdAndUpdate(card_id, {
                quantity: quantity + 1
            })
            responseReturn(res, 200, {
                message: 'success'
            })
        } catch (error) {
            console.log(error.message)
        }
    }
    quantity_dec = async (req, res) => {
        const {
            card_id
        } = req.params
        try {
            const product = await cardModel.findById(card_id)
            const {
                quantity
            } = product
            await cardModel.findByIdAndUpdate(card_id, {
                quantity: quantity - 1
            })
            responseReturn(res, 200, {
                message: 'success'
            })
        } catch (error) {
            console.log(error.message)
        }
    }

    add_wishlist = async (req, res) => {
        const {
            userId,
            productId
        } = req.body
        try {
            const product = await wishlistModel.findOne({
                userId,
                productId
            })
            if (product) {
                responseReturn(res, 404, {
                    error: 'This item is already in your wishlist.'
                })
            } else {
                await wishlistModel.create(req.body)
                responseReturn(res, 201, {
                    message: 'add to wishlist success'
                })
            }
        } catch (error) {
            if (error.code === 11000) {
                return responseReturn(res, 404, {
                    error: 'This item is already in your wishlist.'
                })
            }
            console.log(error.message)
        }
    }

    get_wishlist = async (req, res) => {
        const userId = req.id || req.params.userId
        try {
            const wishlists = await wishlistModel.find({
                userId
            })

            responseReturn(res, 200, {
                wishlistCount: wishlists.length,
                wishlists
            })
        } catch (error) {
            console.log(error.message)
        }
    }

    delete_wishlist = async (req, res) => {
        const {
            wishlistId
        } = req.params
        try {
            const wishlist = await wishlistModel.findByIdAndDelete(wishlistId)
            responseReturn(res, 200, {
                message: 'Remove success',
                wishlistId
            })
        } catch (error) {
            console.log(error.message)
        }
    }
}

module.exports = new cardController()
