require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// JWT verification middleware
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized Access" });
  }

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden Access" });
    }
    req.decoded = decoded;
    next();
  });
};

// MongoDB connection URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.90qadcl.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("✅ Connected to MongoDB Atlas");

    // Collections
    const db = client.db("TheStoryKeeper");
    const BooksCollection = db.collection("Books");
    const OrdersCollection = db.collection("Orders");
    const UsersCollection = db.collection("Users");
    const AdvertiseItemsCollection = db.collection("AdvertiseItems");
    const WishListCollection = db.collection("wishList");
    const PaymentsCollection = db.collection("payments");

    /**
     * Auth / JWT
     */
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ message: "Email query is required" });
      }
      const token = jwt.sign({ email }, process.env.JWT, { expiresIn: "1h" });
      res.send({ accessToken: token });
    });

    /**
     * Books / Categories
     */
    // Get featured categories (up to 2) and their first 4 books
    app.get("/books", async (req, res) => {
      try {
        const allBooks = await BooksCollection.find({}).toArray();
        const uniqueCategoryIds = [
          ...new Set(allBooks.map((book) => book.categoryId)),
        ].slice(0, 2);

        const featured = uniqueCategoryIds.map((catId) =>
          allBooks.filter((book) => book.categoryId === catId).slice(0, 4)
        );

        res.send(featured);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch books" });
      }
    });

    // Get all books organized by category (excluding sold)
    app.get("/allBooks", async (req, res) => {
      try {
        const availableBooks = await BooksCollection.find({
          status: { $ne: "sold" },
        }).toArray();

        const categoryIds = [
          ...new Set(availableBooks.map((b) => b.categoryId)),
        ];
        const grouped = categoryIds.map((catId) =>
          availableBooks.filter((b) => b.categoryId === catId)
        );

        res.send(grouped);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch all books" });
      }
    });

    // Get books by category ID
    app.get("/category/:id", async (req, res) => {
      const catId = parseInt(req.params.id, 10);
      if (isNaN(catId)) {
        return res.status(400).send({ message: "Invalid category ID" });
      }
      try {
        const books = await BooksCollection.find({
          categoryId: catId,
        }).toArray();
        res.send(books);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch category books" });
      }
    });

    // Get a single book by its ObjectId
    app.get("/book/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid book ID" });
      }
      try {
        const book = await BooksCollection.findOne({ _id: new ObjectId(id) });
        res.send(book);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch book" });
      }
    });

    // Get all category names
    app.get("/categories", async (req, res) => {
      try {
        const allBooks = await BooksCollection.find({}).toArray();
        const categories = [...new Set(allBooks.map((book) => book.category))];
        res.send(categories);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch categories" });
      }
    });

    /**
     * Books (Seller)
     */
    // Add a new book
    app.post("/books", async (req, res) => {
      const { book } = req.body;
      if (!book || !book.email || !book.category) {
        return res.status(400).send({ message: "Book data is incomplete" });
      }

      try {
        // Determine or assign categoryId
        const existingBooks = await BooksCollection.find({}).toArray();
        const existingCategoryNames = [
          ...new Set(existingBooks.map((b) => b.category)),
        ];

        if (existingCategoryNames.includes(book.category)) {
          const sample = await BooksCollection.findOne({
            category: book.category,
          });
          book.categoryId = sample.categoryId;
        } else {
          book.categoryId = existingCategoryNames.length + 1;
        }

        // Set verified flag based on seller status
        const seller = await UsersCollection.findOne({ email: book.email });
        book.verified = seller?.verified || false;

        const result = await BooksCollection.insertOne(book);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to add book" });
      }
    });

    // Get seller's products
    app.get("/myProducts", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      try {
        const products = await BooksCollection.find({ email }).toArray();
        res.send(products);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch products" });
      }
    });

    // Delete a seller's product by ID
    app.delete("/myProduct/delete/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid product ID" });
      }

      try {
        await BooksCollection.deleteOne({ _id: new ObjectId(id) });
        await AdvertiseItemsCollection.deleteOne({ _id: id });
        res.send({ acknowledged: true });
      } catch (err) {
        res.status(500).send({ message: "Failed to delete product" });
      }
    });

    // Advertise a book
    app.post("/advertise", async (req, res) => {
      const { product } = req.body;
      if (!product || !product._id) {
        return res.status(400).send({ message: "Product data is required" });
      }

      try {
        const bookId = new ObjectId(product._id);
        await BooksCollection.updateOne(
          { _id: bookId },
          { $set: { advertise: true } },
          { upsert: true }
        );
        product.advertise = true;
        const result = await AdvertiseItemsCollection.insertOne(product);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to advertise product" });
      }
    });

    // Get all advertised items
    app.get("/advertise", verifyJWT, async (req, res) => {
      try {
        const ads = await AdvertiseItemsCollection.find({}).toArray();
        res.send(ads);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch advertised items" });
      }
    });

    /**
     * Orders / Wishlist
     */
    // Place an order
    app.post("/orders", async (req, res) => {
      const orderData = req.body.order;
      if (!orderData || !orderData.productId) {
        return res.status(400).send({ message: "Order data is required" });
      }

      try {
        const bookId = new ObjectId(orderData.productId);

        // Mark the book as pending
        await BooksCollection.updateOne(
          { _id: bookId },
          { $set: { status: "pending" } },
          { upsert: true }
        );

        // If it was advertised, remove from advertised items
        const adItem = await AdvertiseItemsCollection.findOne({
          _id: orderData.productId,
        });
        if (adItem) {
          await BooksCollection.updateOne(
            { _id: bookId },
            { $unset: { advertise: "" } }
          );
          await AdvertiseItemsCollection.deleteOne({
            _id: orderData.productId,
          });
        }

        const result = await OrdersCollection.insertOne(orderData);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to place order" });
      }
    });

    // Get buyer's orders
    app.get("/myOrders", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      try {
        const orders = await OrdersCollection.find({ email }).toArray();
        res.send(orders);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch orders" });
      }
    });

    // Add to wishlist
    app.post("/wishList", async (req, res) => {
      const book = req.body;
      if (!book || !book.productId) {
        return res.status(400).send({ message: "Wishlist item is required" });
      }

      try {
        const result = await WishListCollection.insertOne(book);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to add to wishlist" });
      }
    });

    // Get wishlist items by buyer email
    app.get("/wishList", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ message: "Email query is required" });
      }

      try {
        const items = await WishListCollection.find({ email }).toArray();
        res.send(items);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch wishlist" });
      }
    });

    /**
     * User management
     */
    // Create or store new user
    app.post("/users", async (req, res) => {
      const { newUser } = req.body;
      if (!newUser || !newUser.email) {
        return res.status(400).send({ message: "User data is required" });
      }

      try {
        const existing = await UsersCollection.findOne({
          email: newUser.email,
        });
        if (existing) {
          return res
            .status(409)
            .send({ message: "User with that email already exists" });
        }

        const result = await UsersCollection.insertOne(newUser);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to create user" });
      }
    });

    // Get user type (admin / seller / buyer)
    app.get("/users/type", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email || email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      try {
        const user = await UsersCollection.findOne({ email });
        res.send({ userType: user?.type || "buyer" });
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch user type" });
      }
    });

    /**
     * Admin routes for managing sellers and buyers
     */
    // Get all sellers
    app.get("/allSeller", verifyJWT, async (req, res) => {
      try {
        const sellers = await UsersCollection.find({
          type: "seller",
        }).toArray();
        res.send(sellers);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch sellers" });
      }
    });

    // Delete a seller by email
    app.delete("/delete/seller", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ message: "Email query is required" });
      }

      try {
        // Remove seller's books
        await BooksCollection.deleteMany({ email });

        // Remove orphaned orders
        const allOrders = await OrdersCollection.find({}).toArray();
        for (const order of allOrders) {
          const bookExists = await BooksCollection.findOne({
            _id: new ObjectId(order.productId),
          });
          if (!bookExists) {
            await OrdersCollection.deleteOne({ productId: order.productId });
          }
        }

        // Delete the user
        const result = await UsersCollection.deleteOne({ email });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to delete seller" });
      }
    });

    // Verify a seller
    app.patch("/seller/verify", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ message: "Email query is required" });
      }

      try {
        const result = await UsersCollection.updateOne(
          { email },
          { $set: { verified: true } },
          { upsert: true }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to verify seller" });
      }
    });

    // Get all buyers
    app.get("/allBuyer", verifyJWT, async (req, res) => {
      try {
        const buyers = await UsersCollection.find({ type: "buyer" }).toArray();
        res.send(buyers);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch buyers" });
      }
    });

    // Delete a buyer by email
    app.delete("/delete/buyer", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ message: "Email query is required" });
      }

      try {
        // Restore book statuses for pending orders
        const buyerOrders = await OrdersCollection.find({ email }).toArray();
        for (const order of buyerOrders) {
          if (order.status === "pending") {
            await BooksCollection.updateOne(
              { _id: new ObjectId(order.productId) },
              { $set: { status: "available" } },
              { upsert: true }
            );
          }
        }
        // Delete buyer's orders
        await OrdersCollection.deleteMany({ email });

        // Delete the user
        const result = await UsersCollection.deleteOne({ email });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to delete buyer" });
      }
    });

    /**
     * Payments / Stripe
     */
    // Get order info for payment by order ID
    app.get("/payment/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid order ID" });
      }
      try {
        const order = await OrdersCollection.findOne({
          _id: new ObjectId(id),
        });
        res.send(order);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch payment info" });
      }
    });

    // Get order or wishlist item by product ID for payment
    app.get("/payment2/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const order = await OrdersCollection.findOne({ productId: id });
        if (order) {
          return res.send(order);
        }
        const wishItem = await WishListCollection.findOne({ productId: id });
        res.send(wishItem);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch payment2 info" });
      }
    });

    // Create Stripe payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      if (typeof price !== "number") {
        return res.status(400).send({ message: "Price must be a number" });
      }
      const amount = Math.round(price * 100);
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          currency: "usd",
          amount,
          payment_method_types: ["card"],
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (err) {
        res.status(400).send({ message: err.message });
      }
    });

    // Update payment status from pending to paid
    app.patch("/payment/status/:id", async (req, res) => {
      const { id } = req.params;
      try {
        // First check if it's an order
        const order = await OrdersCollection.findOne({ productId: id });
        if (order) {
          await OrdersCollection.updateOne(
            { productId: id },
            { $set: { status: "paid" } },
            { upsert: true }
          );
          // Update book status to sold
          await BooksCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: "sold" } },
            { upsert: true }
          );
          // If in wishlist, remove it
          await WishListCollection.deleteOne({ productId: id });
          return res.send({ acknowledged: true });
        }

        // Otherwise, check in wishlist
        const wishItem = await WishListCollection.findOne({ productId: id });
        if (wishItem) {
          wishItem.status = "paid";
          await OrdersCollection.insertOne(wishItem);
          await WishListCollection.deleteOne({ productId: id });
          // Update book status
          await BooksCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: "sold" } },
            { upsert: true }
          );
          return res.send({ acknowledged: true });
        }

        res.status(404).send({ message: "No order or wishlist item found" });
      } catch (err) {
        res.status(500).send({ message: "Failed to update payment status" });
      }
    });

    // Store payment record
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      if (!payment || !payment.paymentIntentId) {
        return res.status(400).send({ message: "Payment data is required" });
      }
      try {
        const result = await PaymentsCollection.insertOne(payment);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to save payment" });
      }
    });
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
}

run();

// Default route
app.get("/", (req, res) => {
  res.send("Book Keeper server is running");
});

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).send({ message: "No route found" });
});

// Start the server
app.listen(port, () => {
  console.log(`📚 Book Keeper server is running on port: ${port}`);
});
