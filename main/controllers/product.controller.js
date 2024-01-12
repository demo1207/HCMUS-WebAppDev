const mongoose = require("mongoose");
const Product = require("../models/product.model");
const Category = require("../models/category.model");
const Account = require("../models/account.model");

const defaultLimit = 8;

class productController {
  getCategoryTree = async () => {
    // Fetch categories from the database
    const categories = await Category.find().lean();

    // Function to construct a hierarchical tree from categories
    const buildTree = (categories, parentId = null) => {
        return categories
            .filter(cat => String(cat.parentCategory) === String(parentId))
            .map(cat => ({ ...cat, children: buildTree(categories, cat._id) }));
    };

    // Construct the hierarchical tree from categories
    return buildTree(categories);
  };

  // Method to display all products
  showAllProduct = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || defaultLimit;
      const skip = (page - 1) * limit;

      // Fetch total number of products
      const totalProducts = await Product.countDocuments();

      const products = await Product.find().skip(skip).limit(limit).lean();

      // Calculate total pages
      const totalPages = Math.ceil(totalProducts / limit);

      // Use this.getCategoryTree to build the categories tree
      const categories = await this.getCategoryTree();

      const pageNumbers = [];
      for (let i = 1; i <= totalPages; i++) {
          pageNumbers.push({
              number: i,
              isCurrent: i === page
          });
      }
  
      const paginationData = {
          pages: pageNumbers,
          hasPreviousPage: page > 1,
          previousPage: page - 1,
          hasNextPage: page < totalPages,
          nextPage: page + 1
      };
  
      res.render("all-product", { 
          products, 
          categories,
          pagination: paginationData
      });
    } catch (err) {
        console.error(err);
        next(err);
    }
  };

  showSpecificProduct = async (req, res, next) => {
    try {
      const { productId } = req.params;
      const objectId = new mongoose.Types.ObjectId(productId);
      const product = await Product.findById(objectId).lean();

      if (!product) {
        res.status(404).send("Product not found");
        return;
      }

      let related = [];
      const limit = 8;

      // Find related products in the same category
      related = await Product.find({
        category: product.category,
        _id: { $ne: objectId },
      })
        .limit(limit)
        .lean();

      // Fetch immediate child categories if necessary
      if (related.length < limit) {
        const childCategories = await Category.find({
          parentCategory: product.category,
        }).lean();

        for (const childCategory of childCategories) {
          const childProducts = await Product.find({
            category: childCategory._id,
            _id: { $ne: objectId },
          })
            .limit(limit - related.length)
            .lean();

          related = related.concat(childProducts);
          if (related.length >= limit) break;
        }
      }

      // Fetch sibling categories if necessary
      if (related.length < limit) {
        const currentCategory = await Category.findById(
          product.category
        ).lean();
        if (currentCategory.parentCategory) {
          const siblingCategories = await Category.find({
            parentCategory: currentCategory.parentCategory,
            _id: { $ne: currentCategory._id },
          }).lean();

          for (const siblingCategory of siblingCategories) {
            const siblingProducts = await Product.find({
              category: siblingCategory._id,
              _id: { $ne: objectId },
            })
              .limit(limit - related.length)
              .lean();

            related = related.concat(siblingProducts);
            if (related.length >= limit) break;
          }
        }
      }

      // Fetch products from the immediate ancestor category if necessary
      if (related.length < limit) {
        const currentCategory = await Category.findById(
          product.category
        ).lean();
        if (currentCategory && currentCategory.parentCategory) {
          const ancestorProducts = await Product.find({
            category: currentCategory.parentCategory,
            _id: { $ne: objectId },
          })
            .limit(limit - related.length)
            .lean();

          related = related.concat(ancestorProducts);
        }
      }

      res.render("specific-product", { product, related });
    } catch (err) {
      console.error(err);
      next(err);
    }
  };

  getAllDescendantCategoryIds = async (parentCategoryId) => {
    const categoriesToProcess = [parentCategoryId];
    const allCategoryIds = new Set();

    while (categoriesToProcess.length > 0) {
        const currentCategoryId = categoriesToProcess.pop();
        allCategoryIds.add(currentCategoryId);

        const childCategories = await Category.find({ parentCategory: currentCategoryId }).lean();
        childCategories.forEach(cat => categoriesToProcess.push(cat._id.toString()));
    }

    return Array.from(allCategoryIds);
  }

  filterProducts = async (req, res) => {
    try {
        const { category, minPrice, maxPrice, page = 1, limit = defaultLimit } = req.query;
        let query = {};

        if (category) {
            const allCategoryIds = await this.getAllDescendantCategoryIds(category);
            query.category = { $in: allCategoryIds };
        }

        if (minPrice) {
            query.price = { ...query.price, $gte: parseFloat(minPrice) };
        }

        if (maxPrice) {
            query.price = { ...query.price, $lte: parseFloat(maxPrice) };
        }

        const skip = (page - 1) * limit;
        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        const filteredProducts = await Product.find(query).skip(skip).limit(limit).lean();

        res.json({
          products: filteredProducts,
          total: totalProducts,
          page,
          totalPages,
        });
    } catch (error) {
        console.error('Error in filterProducts:', error);
        res.status(500).send('Server error');
    }
  };

  searchProducts = async (req, res) => {
    try {
      const { keyword, page = 1, limit = defaultLimit } = req.query;
      const skip = (page - 1) * limit;

      const searchQuery = {
        name: { $regex: keyword, $options: 'i' } // Case-insensitive search
      };

      const totalProducts = await Product.countDocuments(searchQuery);
      const totalPages = Math.ceil(totalProducts / limit);

      const products = await Product.find(searchQuery)
                                    .skip(skip)
                                    .limit(limit)
                                    .lean();

      res.json({
        products,
        total: totalProducts,
        page,
        totalPages
      });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Server error');
    }
  };

  deleteFromCart = async (req, res, next) => {
    try {
      // const accountId = req.user._id; // hoặc lấy từ session hoặc JWT
      const accountId = "659f66740be458c494290c39"; // hoặc lấy từ session hoặc JWT
      const productId = req.params.id; // ID của sản phẩm cần xóa

      // Tìm tài khoản người dùng
      const account = await Account.findById(accountId);

      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      // Xóa sản phẩm khỏi giỏ hàng
      account.cart = account.cart.filter(
        (item) => item.id_product.toString() !== productId
      );

      // Lưu lại thay đổi
      await account.save();

      res.json(account.cart); // Gửi lại giỏ hàng đã cập nhật
    } catch (err) {
      res
        .status(500)
        .json({ message: "An error occurred", error: err.message });
    }
  };

  updateQuantityInCart = async (req, res, next) => {
    try {
      const accountId = "659f66740be458c494290c39"; // Hoặc lấy từ session hoặc JWT
      const { productId, newQuantity } = req.body;

      if (newQuantity < 1) {
        return res.status(400).json({ message: "Invalid quantity" });
      }

      // Tìm tài khoản người dùng và cập nhật số lượng sản phẩm trong giỏ hàng
      // const account = await Account.findOneAndUpdate(
      //   { _id: accountId, "cart.id_product".toString() == productId },
      //   { $set: { "cart.$.quantity": newQuantity } },
      //   { new: true }
      // );

      const account = await Account.findById(accountId);

      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      // Find the product in the cart and update its quantity
      let productFound = false;
      account.cart.forEach((item) => {
        if (item.id_product.toString() === productId) {
          item.quantity = newQuantity;
          productFound = true;
        }
      });

      // If product not found in cart, handle appropriately
      if (!productFound) {
        return res.status(404).json({ message: "Product not found in cart" });
      }

      // Save the updated account
      await account.save();

      res.json(account.cart); // Send back the updated cart
    } catch (err) {
      res
        .status(500)
        .json({ message: "An error occurred", error: err.message });
    }
  };
}

// Export an instance of the controller
module.exports = new productController();
