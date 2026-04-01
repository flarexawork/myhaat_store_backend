const formidable = require('formidable')
const cloudinary = require('cloudinary').v2
const productModel = require('../../models/productModel');
const sellerModel = require('../../models/sellerModel')
const { responseReturn } = require('../../utiles/response');
const authOrderModel = require('../../models/authOrder');
const { getActiveSellers } = require('../../utiles/activeSellerFilter');

class productController {

    add_product = async (req, res) => {
        const { id } = req;
        const form = formidable({ multiples: true })

        form.parse(req, async (err, field, files) => {
            let { name, category, description, stock, price, discount, shopName, brand } = field;
            const { images } = files;
            name = name.trim()
            name = name.replace(/[^a-zA-Z0-9\s-]/g, '')
            const slug = name.split(' ').join('-')


            cloudinary.config({
            cloud_name: process.env.CLOUD_NAME,
            api_key: process.env.API_KEY,
            api_secret: process.env.API_SECRET,
            secure: true
        })

            try {
                let allImageUrl = [];

                for (let i = 0; i < images.length; i++) {
                    const result = await cloudinary.uploader.upload(images[i].filepath, { folder: 'products' })
                    allImageUrl = [...allImageUrl, result.secure_url]
                }

                await productModel.create({
                    sellerId: id,
                    name,
                    slug,
                    shopName,
                    category: category.trim(),
                    description: description.trim(),
                    stock: parseInt(stock),
                    price: parseInt(price),
                    discount: parseInt(discount),
                    images: allImageUrl,
                    brand: brand.trim(),
                    approval_status: 'pending'

                })
                responseReturn(res, 201, { message: "product add success" })
            } catch (error) {
                responseReturn(res, 500, { error: error.message })
            }

        })
    }



    delete_product = async (req, res) => {
        const { productId } = req.params;

        try {
            // find product first
            const product = await productModel.findById(productId);

            if (!product) {
                return responseReturn(res, 404, { error: 'Product not found' });
            }

            // cloudinary config
           cloudinary.config({
            cloud_name: process.env.CLOUD_NAME,
            api_key: process.env.API_KEY,
            api_secret: process.env.API_SECRET,
            secure: true
        })

            // delete images from cloudinary
            for (let img of product.images) {
                const publicId = img.split('/').pop().split('.')[0];
                await cloudinary.uploader.destroy(`products/${publicId}`);
            }

            // delete product from DB
            await productModel.findByIdAndDelete(productId);

            responseReturn(res, 200, { message: 'Product deleted successfully' });

        } catch (error) {
            responseReturn(res, 500, { error: error.message });
        }
    }

    products_get = async (req, res) => {
        const { page, searchValue, parPage } = req.query
        const { id } = req;

        const skipPage = parseInt(parPage) * (parseInt(page) - 1);

        try {
            if (searchValue) {
                const products = await productModel.find({
                    $text: { $search: searchValue },
                    sellerId: id
                }).skip(skipPage).limit(parPage).sort({ createdAt: -1 })
                const totalProduct = await productModel.find({
                    $text: { $search: searchValue },
                    sellerId: id
                }).countDocuments()
                responseReturn(res, 200, { totalProduct, products })
            } else {
                const products = await productModel.find({ sellerId: id }).skip(skipPage).limit(parPage).sort({ createdAt: -1 })
                const totalProduct = await productModel.find({ sellerId: id }).countDocuments()
                responseReturn(res, 200, { totalProduct, products })
            }
        } catch (error) {
            console.log(error.message)
        }
    }

    product_get = async (req, res) => {
        const { productId } = req.params;
        try {
            const product = await productModel.findById(productId)
            responseReturn(res, 200, { product })
        } catch (error) {
            console.log(error.message)
        }
    }
    product_update = async (req, res) => {
        const { id } = req
        let { name, description, discount, price, brand, productId, stock } = req.body;
        name = name.trim()
        name = name.replace(/[^a-zA-Z0-9\s-]/g, '')
        const slug = name.split(' ').join('-')

        try {
            const product = await productModel.findById(productId)

            if (!product) {
                return responseReturn(res, 404, { error: 'Product not found' })
            }

            if (String(product.sellerId) !== String(id)) {
                return responseReturn(res, 403, { error: 'Unauthorized product access' })
            }

            if (product.approval_status === 'approved') {
                return responseReturn(res, 400, { error: 'Approved product cannot be edited by seller' })
            }

            await productModel.findByIdAndUpdate(productId, {
                name, description, discount, price, brand, productId, stock, slug
            })
            const updatedProduct = await productModel.findById(productId)
            responseReturn(res, 200, { product: updatedProduct, message: 'product update success' })
        } catch (error) {
            responseReturn(res, 500, { error: error.message })
        }
    }
    product_image_update = async (req, res) => {
        const { id } = req
        const form = formidable({ multiples: true })

        form.parse(req, async (err, field, files) => {
            const { productId, oldImage } = field;
            const { newImage } = files

            if (err) {
                responseReturn(res, 404, { error: err.message })
            } else {
                try {
                    const product = await productModel.findById(productId)

                    if (!product) {
                        return responseReturn(res, 404, { error: 'Product not found' })
                    }

                    if (String(product.sellerId) !== String(id)) {
                        return responseReturn(res, 403, { error: 'Unauthorized product access' })
                    }

                    if (product.approval_status === 'approved') {
                        return responseReturn(res, 400, { error: 'Approved product cannot be edited by seller' })
                    }

                    cloudinary.config({
                        CLOUD_NAME: process.env.CLOUD_NAME,
                        API_KEY: process.env.API_KEY,
                        API_SECRET: process.env.API_SECRET,
                        secure: true
                    })
                    const result = await cloudinary.uploader.upload(newImage.filepath, { folder: 'products' })

                    if (result) {
                        let { images } = product
                        const index = images.findIndex(img => img === oldImage)
                        if (index === -1) {
                            return responseReturn(res, 400, { error: 'Old image not found for this product' })
                        }
                        images[index] = result.secure_url;

                        await productModel.findByIdAndUpdate(productId, {
                            images
                        })

                        const product = await productModel.findById(productId)
                        responseReturn(res, 200, { product, message: 'product image update success' })
                    } else {
                        responseReturn(res, 404, { error: 'image upload failed' })
                    }
                } catch (error) {
                    responseReturn(res, 404, { error: error.message })
                }
            }
        })
    }


    approve_product = async (req, res) => {
        const { productId } = req.params;
        const { id } = req;

        try {
            const product = await productModel.findByIdAndUpdate(
                productId,
                {
                    approval_status: 'approved',
                    approvedBy: id,
                    approvedAt: new Date()
                },
                { new: true }
            );

            responseReturn(res, 200, { message: 'Product approved', product });
        } catch (error) {
            responseReturn(res, 500, { error: error.message });
        }
    }

    reject_product = async (req, res) => {
        const { productId } = req.params;
        const { id } = req;

        try {
            const product = await productModel.findByIdAndUpdate(
                productId,
                {
                    approval_status: 'rejected',
                    approvedBy: id,
                    approvedAt: new Date()
                },
                { new: true }
            );

            responseReturn(res, 200, { message: 'Product rejected', product });
        } catch (error) {
            responseReturn(res, 500, { error: error.message });
        }
    }

    admin_products_get = async (req, res) => {

        const { page, searchValue, parPage } = req.query;
        const skipPage = parseInt(parPage) * (parseInt(page) - 1);

        try {
            const activeSellers = await getActiveSellers();

            let query = {
                sellerId: { $in: activeSellers }
            };

            if (searchValue) {

                const sellers = await sellerModel.find({
                    name: { $regex: searchValue, $options: "i" },
                    status: 'active'
                }).select('_id');

                const sellerIds = sellers.map(s => s._id);

                query.$or = [
                    { name: { $regex: searchValue, $options: "i" } },
                    { category: { $regex: searchValue, $options: "i" } },
                    { brand: { $regex: searchValue, $options: "i" } },
                    { description: { $regex: searchValue, $options: "i" } },
                    { sellerId: { $in: sellerIds } }
                ];
            }

            const products = await productModel
                .find(query)
                .populate('sellerId', 'name email shopInfo')
                .skip(skipPage)
                .limit(parseInt(parPage))
                .sort({ createdAt: -1 });

            const totalProduct = await productModel.countDocuments(query);

            /* 🔥 ADD SELLER ORDER STATS */

            const productsWithStats = await Promise.all(
                products.map(async (product) => {

                    const sellerId = product.sellerId;

                    const totalOrders = await authOrderModel.countDocuments({
                        sellerId
                    });

                    const pendingOrders = await authOrderModel.countDocuments({
                        sellerId,
                        delivery_status: 'pending'
                    });

                    const deliveredOrders = await authOrderModel.countDocuments({
                        sellerId,
                        delivery_status: 'delivered'
                    });

                    const cancelledOrders = await authOrderModel.countDocuments({
                        sellerId,
                        delivery_status: 'cancelled'
                    });

                    return {
                        ...product.toObject(),
                        sellerProgress: {
                            totalOrders,
                            pendingOrders,
                            deliveredOrders,
                            cancelledOrders
                        }
                    };
                })
            );

            responseReturn(res, 200, {
                totalProduct,
                products: productsWithStats
            });

        } catch (error) {
            responseReturn(res, 500, { error: error.message });
        }
    };


    product_full_details = async (req, res) => {
        const { productId } = req.params;

        try {
            const product = await productModel.findById(productId)
                .populate({
                    path: 'sellerId',
                    select: 'name email status payment method image shopInfo createdAt'
                })
                .populate({
                    path: 'approvedBy',
                    select: 'name email'
                });

            if (!product) {
                return responseReturn(res, 404, { error: 'Product not found' });
            }

            // Check if seller is active
            if (product.sellerId && product.sellerId.status !== 'active') {
                return responseReturn(res, 404, { error: 'Product not found' });
            }

            responseReturn(res, 200, { product });

        } catch (error) {
            responseReturn(res, 500, { error: error.message });
        }
    };

}

module.exports = new productController()
