const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();

// Middleware
app.use(cors());
app.use(express.json());

// Default route
app.get("/", (req, res) => {
  res.send("Book Keeper server is running");
});

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.90qadcl.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const run = async () => {
  const BooksCollection = client.db("TheStoryKeeper").collection("Books");
  const OrderCollection = client.db("TheStoryKeeper").collection("Orders");

  try {
    // Get some category book to display home page
    app.get("/books", async (req, res) => {
        const result = await BooksCollection.find({}).toArray();
    //   const result = require("./books.json");

      // Find all category by Category Id
      const category = [];
      const categories = result.map((book) => book.categoryId);
      categories.forEach((id) => {
        if (!category.includes(id)) {
          category.push(id);
        }
      });
      const sliceCategory = category.slice(0, 2); // Slice 3 category for display home page

      // Filter all books by category Id
      const filteredBooks = [];
      sliceCategory.forEach((catId) => {
        const bookByCatId = result.filter((book) => book.categoryId === catId);
        filteredBooks.push(bookByCatId);
      });

      const sliceFilteredBook = filteredBooks.slice(0, 4); // Slice only 4 books to display home page

      res.send(sliceFilteredBook);
    });

    // Get specific category books by Id
    app.get("/category/:id", async (req, res) => {
      const catId = req.params.id;
      const query = { categoryId: catId };
      const result = await BooksCollection.find(query).toArray();

    //   const test = require("./books.json");
    //   const result = test.filter((book) => book.categoryId === catId);

      res.send(result);
    });

    // Get all books
    app.get("/allBooks", async (req, res) => {
      const query = {};
      const result = await BooksCollection.find(query).toArray();

    //   const result = require("./books.json");

      // Filter all specific category id
      const category = [];
      const categories = result.map((book) => book.categoryId);
      categories.forEach((id) => {
        if (!category.includes(id)) {
          category.push(id);
        }
      });

      // Filter all books by category Id
      const filteredBooks = [];
      category.forEach((catId) => {
        const bookByCatId = result.filter((book) => book.categoryId === catId);
        filteredBooks.push(bookByCatId);
      });
      const sliceFilteredBook = filteredBooks.slice(0, 8);

      res.send(sliceFilteredBook);
    });

    // Get specific book details by book id
    app.get('/book/:id' , async(req, res) => {
        const id = req.params.id;
        const query = { _id:ObjectId(id) };
        const result = await BooksCollection.findOne(query);

        res.send(result);
    })


    // Order a book
    app.post('/orders', async(req, res) => {
        const orderData = req.body.order;
        const result = await OrderCollection.insertOne(orderData);

        res.send(result);
    })


  } catch {}
};

run().catch((err) => console.error(err));

// Listen
app.listen(port, () => {
  console.log(`Book Keeper server is running on port: ${port}`);
});
