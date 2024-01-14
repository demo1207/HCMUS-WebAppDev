const { request } = require("express");
const Order = require("../models/order.model");
const Product = require("../models/product.model");
const Account = require("../models/account.model");

class orderController {

  CreateOrderForCartAndSendToken = async (req, res, next) => {
    try {
      const accBuyer = await Account.findOne({ _id: req.cookies.user._id })
        .populate("cart.id_product");
  
      // console.log("check cart user");
      // console.log(accBuyer.cart);
      // console.log("end check cart user");
  
      // Tạo một mảng chi tiết đơn hàng từ giỏ hàng
      const orderDetails = accBuyer.cart.map(cartItem => ({
        idProduct: cartItem.id_product._id,
        quantity: cartItem.quantity,
      }));
  
      // Tạo một đơn đặt hàng mới với tất cả các mặt hàng trong giỏ
      const newOrder = new Order({
        idaccount: accBuyer._id,
        detail: orderDetails,
        status: "paying",
        // message: req.body.message, // Lấy từ form đầu vào
      });
  
      // Lưu đơn hàng mới
      const savedOrder = await newOrder.save();
  
      // Xóa giỏ hàng sau khi tạo đơn hàng
      accBuyer.cart = [];
      await accBuyer.save();
  
      // Chuyển hướng người dùng đến trang đơn hàng đang chờ xử lý (hoặc xử lý khác)
      // res.redirect(`/account/my-order-pending/${req.user.id}`);
    } catch (error) {
      next(error);
    }
  };
  

  totalPrice = async (arr) => {
    let total = 0;
    for (let i = 0; i < arr.length; i++) {
      let item = await Product.findOne({ _id: arr[i].idProduct });
      total += item.price * arr[i].quantity;
    }
    return total;
  };

  // [GET] 
  getOrderHistory = async (req, res, next) => {
    try {
      const user = req.cookies.user;
      const orders = await Order.find({ idaccount: user._id });
      const arr = [];
      for (let i = 0; i < orders.length; i++) {
        let obj = {
          _id: orders[i]._id,
          date: orders[i].date,
          total: await this.totalPrice(orders[i].detail),
          status: orders[i].status,
        };
        arr.push(obj);
      }
      res.render("orderHistory", {
        firstname: user.firstname,
        lastname: user.lastname,
        orders: arr,
      });
    } catch (err) {
      next(err);
    }
  };

  getOrderDetail = async (req, res, next) => {
    try {
      const orderId = req.query.id;
      const order = await Order.findById(orderId);
      const obj = {
        _id: order._id,
        total: 0,
        date: order.date,
        status: order.status,
        message: order.message,
      };
      const prds = [];
      for (let i = 0; i < order.detail.length; i++) {
        const item = await Product.findById(order.detail[i].idProduct);
        const prd = {
          _id: item._id,
          name: item.name,
          discription: item.discription,
          image: item.image[0],
          price: item.price,
          quantity: order.detail[i].quantity,
        };
        (prd.total = prd.price * prd.quantity), (obj.total += prd.total);
        prds.push(prd);
      }
      res.render("orderDetail", {
        obj,
        prds,
        lastname: req.cookies.user.lastname,
        firstname: req.cookies.user.firstname,
      });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new orderController();
