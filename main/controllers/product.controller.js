const mongoose = require("mongoose");
const Product = require("../models/product.model");
const Category = require("../models/category.model");
const Account = require("../models/account.model");

const defaultLimit = 8;

buildFullName = async (category) => {
  if (!category.parentCategory) {
    return `Danh mục gốc/${category.name}`;
  } else {
    const parentCategory = await Category.findById(category.parentCategory);
    if (!parentCategory) {
      return category.name;
    } else {
      const parentFullName = await buildFullName(parentCategory);
      return `${parentFullName}/${category.name}`;
    }
  }
};

calculateTotalProductCount = async (category) => {
  const childCategories = await Category.find({ parentCategory: category._id });
  const childCategoriesIds = childCategories.map(
    (childCategory) => childCategory._id
  );

  const productCountInCategory = await Product.countDocuments({
    category: category._id,
  });
  const productCountInChildCategories = await Product.countDocuments({
    category: { $in: childCategoriesIds },
  });

  return productCountInCategory + productCountInChildCategories;
};

class productController {
  getCategoryTree = async () => {
    // Fetch categories from the database
    const categories = await Category.find().lean();

    // Function to construct a hierarchical tree from categories
    const buildTree = (categories, parentId = null) => {
      return categories
        .filter((cat) => String(cat.parentCategory) === String(parentId))
        .map((cat) => ({ ...cat, children: buildTree(categories, cat._id) }));
    };

    // console.log(buildTree(categories));

    return buildTree(categories);
  };

  renderAllProduct = async (req, res, next) => {
    try {
      // const categories = await this.getCategoryTree();
      const searchTerm = req.query.keyword || "";
      const category = req.query.category || "";

      const maxPriceProduct = await Product.findOne()
        .sort({ price: -1 })
        .limit(1);
      const maxPrice = maxPriceProduct ? maxPriceProduct.price : 0;

      res.render("all-product", {
        searchTerm: searchTerm,
        category: category,
        maxPrice: maxPrice,
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
      // console.log(product);

      if (!product) {
        res.status(404).send("Product not found");
        return;
      }

      res.render("specific-product", { product });
    } catch (err) {
      console.error(err);
      next(err);
    }
  };

  APIRelatedProducts = async (req, res, next) => {
    try {
      const { productId } = req.query;
      const page = parseInt(req.query.page, 10) || 1; // Default to 1 if not provided
      const limit = parseInt(req.query.limit, 10) || defaultLimit; // Use a default limit if not provided

      // console.log(page);

      // console.log(productId);

      const objectId = new mongoose.Types.ObjectId(productId);
      const product = await Product.findById(objectId).lean();
      // console.log(product);
      const currentCategory = await Category.findById(product.category).lean();
      // console.log(currentCategory);

      if (!product) {
        res.status(404).send("Product not found");
        return;
      }

      let related = [];
      let totalProducts = 0;
      let query = {};

      let skip = (page - 1) * limit;
      const calculateSkip = (skip, totalProducts, relatedLength) => {
        skip -= totalProducts - relatedLength;
        if (skip < 0) skip = 0;
        // console.log(skip);
        return skip;
      };

      // Find related products in the same category
      // console.log(product.category);
      // console.log(objectId);
      // console.log(skip);
      // console.log(limit);
      query = {
        category: product.category,
        _id: { $ne: objectId },
      };
      related = await Product.find(query).skip(skip).limit(limit).lean();
      totalProducts += await Product.countDocuments(query);
      skip = calculateSkip(skip, totalProducts, related.length);

      // If the limit is not reached, continue with child categories
      // console.log(skip - related.length);
      if (related.length < limit) {
        // Fetch child categories
        const childCategories = await Category.find({
          parentCategory: product.category,
        }).lean();

        // console.log(childCategories);

        for (const childCategory of childCategories) {
          query = {
            category: childCategory._id,
            _id: { $ne: objectId },
          };
          const skipValue = skip;
          const limitValue = limit - related.length;
          const childProducts = await Product.find(query)
            .skip(skipValue) // Adjust skip based on already fetched products
            .limit(limitValue)
            .lean();
          related = related.concat(childProducts);
          totalProducts += await Product.countDocuments(query);
          skip = calculateSkip(skip, totalProducts, related.length);

          if (related.length >= limit) break;
        }
      }

      // console.log(related.length);
      // console.log(totalProducts);

      // Check if more products are needed from sibling categories
      if (related.length < limit && currentCategory.parentCategory) {
        const siblingCategories = await Category.find({
          parentCategory: currentCategory.parentCategory,
          _id: { $ne: currentCategory._id },
        }).lean();

        for (const siblingCategory of siblingCategories) {
          query = {
            category: siblingCategory._id,
            _id: { $ne: objectId },
          };
          const skipValue = skip;
          const limitValue = limit - related.length;

          // console.log(skipValue, limitValue);

          const siblingProducts = await Product.find(query)
            .skip(skipValue) // Adjust skip based on already fetched products
            .limit(limitValue)
            .lean();
          related = related.concat(siblingProducts);
          totalProducts += await Product.countDocuments(query);
          skip = calculateSkip(skip, totalProducts, related.length);

          if (related.length >= limit) break;
        }
      }

      // console.log(related.length);
      // console.log(totalProducts);

      // Check if more products are needed from the ancestor category
      if (related.length < limit && currentCategory.parentCategory) {
        query = {
          category: currentCategory.parentCategory,
          _id: { $ne: objectId },
        };
        const skipValue = skip;
        const limitValue = limit - related.length;
        const ancestorProducts = await Product.find(query)
          .skip(skipValue)
          .limit(limitValue)
          .lean();
        related = related.concat(ancestorProducts);
        totalProducts += await Product.countDocuments(query);
        skip = calculateSkip(skip, totalProducts, related.length);
      }

      // console.log(related.length);

      const totalPages = Math.ceil(totalProducts / limit);

      const pageNumbers = [];
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push({
          number: i,
          isCurrent: i === parseInt(page),
        });
      }
      const paginationData = {
        pages: pageNumbers,
        hasPreviousPage: page > 1,
        previousPage: page - 1,
        hasNextPage: page < totalPages,
        nextPage: page + 1,
      };

      // console.log(paginationData);

      res.json({
        products: related,
        pagination: paginationData,
      });
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

      const childCategories = await Category.find({
        parentCategory: currentCategoryId,
      }).lean();
      childCategories.forEach((cat) =>
        categoriesToProcess.push(cat._id.toString())
      );
    }

    return Array.from(allCategoryIds);
  };

  APIProducts = async (req, res) => {
    try {
      const { keyword, category, minPrice, maxPrice, sortOrder } = req.query;

      // console.log(keyword);

      const page = parseInt(req.query.page, 10) || 1; // Default to 1 if not provided
      const limit = parseInt(req.query.limit, 10) || defaultLimit; // Use a default limit if not provided

      let query = {};

      if (keyword) {
        query.name = { $regex: keyword, $options: "i" }; // Case-insensitive search
      }
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

      // Sorting logic
      let sortQuery = {};
      if (sortOrder === "low-to-high") {
        sortQuery.price = 1; // Ascending order
      } else if (sortOrder === "high-to-low") {
        sortQuery.price = -1; // Descending order
      }

      // console.log(sortQuery);

      const filteredProducts = await Product.find(query)
        .sort(sortQuery)
        .skip(skip)
        .limit(limit)
        .lean();

      const pageNumbers = [];
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push({
          number: i,
          isCurrent: i === parseInt(page),
        });
      }

      const paginationData = {
        pages: pageNumbers,
        hasPreviousPage: page > 1,
        previousPage: page - 1,
        hasNextPage: page < totalPages,
        nextPage: page + 1,
      };

      // console.log(paginationData);

      res.json({
        products: filteredProducts,
        pagination: paginationData,
      });
    } catch (error) {
      console.error("Error in filterProducts:", error);
      res.status(500).send("Server error");
    }
  };

  // searchProducts = async (req, res) => {
  //   try {
  //     const { keyword, page = 1, limit = defaultLimit } = req.query;
  //     const skip = (page - 1) * limit;

  //     const searchQuery = {
  //       name: { $regex: keyword, $options: "i" }, // Case-insensitive search
  //     };

  //     const totalProducts = await Product.countDocuments(searchQuery);
  //     const totalPages = Math.ceil(totalProducts / limit);

  //     const products = await Product.find(searchQuery)
  //       .skip(skip)
  //       .limit(limit)
  //       .lean();

  //     // Create page numbers array
  //     const pageNumbers = [];
  //     for (let i = 1; i <= totalPages; i++) {
  //       pageNumbers.push({
  //         number: i,
  //         isCurrent: i === parseInt(page),
  //       });
  //     }

  //     const paginationData = {
  //       pages: pageNumbers,
  //       hasPreviousPage: page > 1,
  //       previousPage: page - 1,
  //       hasNextPage: page < totalPages,
  //       nextPage: page + 1,
  //     };

  //     res.json({
  //       products,
  //       pagination: paginationData,
  //     });
  //   } catch (error) {
  //     console.error("Error:", error);
  //     res.status(500).send("Server error");
  //   }
  // };

  deleteFromCart = async (req, res, next) => {
    try {
      // const accountId = req.user._id; // hoặc lấy từ session hoặc JWT
      // const accountId = "659f8a8c0be458c494290c40"; // hoặc lấy từ session hoặc JWT
      const accountId = req.cookies.user._id.toString();
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
      // const accountId = "659f8a8c0be458c494290c40"; // Hoặc lấy từ session hoặc JWT
      const accountId = req.cookies.user._id.toString();
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

  addToCart = async (req, res, next) => {
    try {
      // Assuming the user's ID is obtained from the session or a JWT token
      // const accountId = req.user._id; // Replace with your session or JWT token logic
      // const accountId = "659f8a8c0be458c494290c40";
      const accountId = req.cookies.user._id.toString();
      const { productId, quantity } = req.body;
      // console.log("check accID id");
      // console.log(accountId);
      // console.log("end check accID id");
      if (!productId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ message: "Invalid product ID format" });
      }

      if (!productId || quantity <= 0) {
        return res
          .status(400)
          .json({ message: "Invalid product ID or quantity" });
      }

      const account = await Account.findById(accountId);

      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      // Check if the product already exists in the cart
      const productIndex = account.cart.findIndex(
        (item) => item.id_product.toString() === productId
      );

      if (productIndex > -1) {
        // Update quantity if product already in cart
        account.cart[productIndex].quantity += quantity;
      } else {
        // Add new product to cart
        const ObjectId = mongoose.Types.ObjectId;
        // account.cart.push({ id_product: productId, quantity });
        account.cart.push({ id_product: new ObjectId(productId), quantity });
      }

      // Save the updated account
      await account.save();

      res.json({
        message: "Product added to cart successfully",
        cart: account.cart,
      });
    } catch (err) {
      console.error("Error adding product to cart:", err);
      res
        .status(500)
        .json({ message: "An error occurred", error: err.message });
    }
  };

  getHandle = async (req, res, next) => {
    try {
      // Tìm tất cả sản phẩm và populate thông tin của danh mục
      const allProducts = await Product.find();

      // Chuyển list image thành object
      const products = allProducts.map((product) => {
        const transformedImages = {};
        let imgs = "";
        product.image.forEach((img, index) => {
          transformedImages[`i${index + 1}`] = img;
          if (index !== 0) {
            imgs += `;${img}`;
          } else {
            imgs += img;
          }
        });

        return {
          ...product.toObject(),
          image: transformedImages,
          imgs,
        };
      });

      // Tìm tất cả danh mục
      const allCategories = await Category.find();

      // Xây dựng tên đầy đủ và lấy số lượng sản phẩm cho từng danh mục
      const fullCategories = await Promise.all(
        allCategories.map(async (category) => {
          const parentCategory = await Category.findById(
            category.parentCategory
          );
          const parentName = parentCategory
            ? await buildFullName(parentCategory)
            : "Danh mục gốc";
          const fullName = `${parentName}/${category.name}`;
          return {
            ...category.toObject(),
            fullName,
          };
        })
      );
      fullCategories.sort((a, b) => a.fullName.localeCompare(b.fullName));

      // console.log(products);
      res.render("producthandle", { nshowHF: true, products, fullCategories });
    } catch (error) {
      next(error);
    }
  };

  getCateHandle = async (req, res, next) => {
    try {
      // Tìm tất cả danh mục
      const allCategories = await Category.find();

      // Xây dựng tên đầy đủ và lấy số lượng sản phẩm cho từng danh mục
      const fullCategories = await Promise.all(
        allCategories.map(async (category) => {
          const parentCategory = await Category.findById(
            category.parentCategory
          );
          const parentName = parentCategory
            ? await buildFullName(parentCategory)
            : "Danh mục gốc";
          const productCount = await calculateTotalProductCount(category);
          const fullName = `${parentName}/${category.name}`;
          return {
            ...category.toObject(),
            fullName,
            productCount,
            parentName,
          };
        })
      );
      fullCategories.sort((a, b) => a.fullName.localeCompare(b.fullName));

      res.render("categoryhandle", { nshowHF: true, fullCategories });
    } catch (error) {
      next(error);
    }
  };

  createCategory = async (req, res, next) => {
    // console.log(req.body);
    try {
      let { name, description, parentCategory } = req.body;
      // Convert an empty string to null for parentCategory
      parentCategory = parentCategory ? parentCategory : null;

      const newCategory = new Category({
        name,
        description,
        parentCategory,
      });
      await newCategory.save();
      // res.status(201).send('Danh mục được tạo thành công');
      res.redirect("/product/categories");
    } catch (error) {
      next(error);
    }
  };

  updateCategory = async (req, res, next) => {
    // console.log(req.body);
    try {
      let { name, description, parentCategory, id } = req.body;
      parentCategory = parentCategory ? parentCategory : null;
      // console.log(id);
      const category = await Category.findById(id);
      if (!category) {
        return res.status(404).send("Danh mục không tồn tại");
      }
      category.name = name;
      category.description = description;
      category.parentCategory = parentCategory;
      await category.save();
      res.redirect("/product/categories");
    } catch (error) {
      next(error);
    }
  };

  deleteCategory = async (req, res, next) => {
    try {
      const { id } = req.body;

      // Check if the category exists
      const category = await Category.findById(id);
      if (!category) {
        return res.status(404).send("Danh mục không tồn tại");
      }

      // Save parent category ID for later use
      const parentCategoryId = category.parentCategory;

      // Remove the category
      await Category.findByIdAndRemove(id);

      // Find and update all child categories
      const childCategories = await Category.find({ parentCategory: id });
      for (const child of childCategories) {
        child.parentCategory = parentCategoryId; // Set to parent of deleted category, or null if it had no parent
        await child.save();
      }

      res.redirect("/product/categories");
    } catch (error) {
      next(error);
    }
  };

  deleteProduct = async (req, res, next) => {
    try {
      const { id } = req.body;
      const prd = await Product.findOne({ _id: id });
      console.log(prd);
      if (!prd) {
        return res.status(404).send("Sản phẩm không tồn tại");
      }
      await Product.deleteOne({ _id: id });
      res.redirect("/product/handle");
    } catch (err) {
      next(err);
    }
  };

  updateProduct = async (req, res, next) => {
    try {
      console.log(req.body);
      const { name, price, stock, category, description, id } = req.body;
      const prd = await Product.findOne({ _id: id });
      if (!prd) {
        return res.status(404).send("Sản phẩm không tồn tại");
      }
      await Product.updateOne(
        { _id: id },
        {
          $set: {
            name: name,
            price: price,
            stock: stock,
            category: category,
            description: description,
            id: id,
          },
        }
      );
      res.redirect("/product/handle");
    } catch (err) {
      next(err);
    }
  };

  createProduct = async (req, res, next) => {
    try {
      console.log(req.body);
      const { name, price, stock, category, description, id } = req.body;
      var avatar = [];
      for (var file of req.files) {
        avatar.push(`/img/products/${file.filename}`);
      }
      const newProduct = new Product({
        name: name,
        price: price,
        description: description,
        stock: stock,
        category: category, // Replace with the actual ObjectId of a category
        image: avatar,
      });
      newProduct
        .save()
        .then((savedProduct) => {
          console.log("New product created:", savedProduct);
        })
        .catch((error) => {
          console.error("Error creating product:", error.message);
        });
      res.redirect("/product/handle");
    } catch (err) {
      next(err);
    }
  };
}

// Export an instance of the controller
// Export an instance of the controller
module.exports = new productController();
