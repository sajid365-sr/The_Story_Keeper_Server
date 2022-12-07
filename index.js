const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
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
  const UsersCollection = client.db("TheStoryKeeper").collection("Users");

  try {
    // Assign JW Token

    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const state = req.query.state;

      const query = { email: email };
      const user = await UsersCollection.findOne(query);

      if (user || state) {
        const token = jwt.sign({ email }, process.env.JWT, { expiresIn: "1h" });

        return res.send({ accessToken: token });
      }

      res.status(403).send({ accessToken: "" });
    });

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

    // Get all books (book route)
    app.get("/allBooks", async (req, res) => {
      const query = {};
      const result = await BooksCollection.find(query).toArray();


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
    app.get("/book/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await BooksCollection.findOne(query);

      res.send(result);
    });

    // Order a book
    app.post("/orders", async (req, res) => {
      const orderData = req.body.order;
      const result = await OrderCollection.insertOne(orderData);

      res.send(result);
    });

    //  Store User data
    app.post("/users", async (req, res) => {
      const user = req.body.newUser;
      const result = await UsersCollection.insertOne(user);

      res.send(result);
    });

    // verify seller/buyer or admin
    app.get("/users/type", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await UsersCollection.findOne(query);
      const userType = result.type;

      res.send({ userType });
    });

    // Get buyer orders
    app.get("/myOrders", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await OrderCollection.find(query).toArray();

      
      res.send(result);
    });

   


    // Add a new product(book) => seller route
    app.post("/books", async (req, res) => {
        const allBook = await BooksCollection.find({}).toArray();
        const book = req.body.book;
        
        const query = {category : book.category};
      
        const categoryName = allBook.map(book => book.category);
        const filteredBooksByName = [];
        
        categoryName.forEach((catName) => {
          if (!filteredBooksByName.includes(catName)) {
            filteredBooksByName.push(catName);
          }
          
        });


        if(filteredBooksByName.includes(book.category)){
            const getBook = await BooksCollection.findOne(query);
            const getId = getBook.categoryId;

            book.categoryId = getId;
        }
        else{
            book.categoryId = filteredBooksByName.length + 1;
        }

        

      const result = await BooksCollection.insertOne(book);
      res.send(result);

    });

// Get seller all products (seller myProducts route)
app.get("/myProducts", async (req, res) => {
    const email = req.query.email;
    const query = { email: email };
    const result = await BooksCollection.find(query).toArray();


    res.send(result);
  });


  // Delete my product (seller route)

app.delete('/myProduct/delete/:id', async(req,res) =>{
    const id = req.params.id;
    const query = { _id:ObjectId(id) };
    const result = await BooksCollection.deleteOne(query);
    
    const orders = await OrderCollection.find({productId:id}).toArray();
    if(orders.length >= 1){
        orders.forEach(order => {
            if(order.status !== 'paid'){
                
                OrderCollection.deleteOne({productId:id});
            }
        })
        
    }

    res.send(result);
})





   // Check product status (seller myProducts route)
//    app.post('/myProducts/status', async(req, res) =>{
//        const ids = req.body;
//        const orders = await OrderCollection.find({}).toArray();
//         const books = await BooksCollection.find({}).toArray();
//        const filterOrder = [];
//        ids.forEach(id => {
//            const filter = orders.filter(order => order.productId === id);
//            filterOrder.push(filter)
           
//         })
//         const filterBook = [];
//         books.forEach(book => {
//             const filter2 = filterOrder.filter(order => order.productId === book._id);
//             filterBook.push(filter2);
//         })

//        console.log(filterBook)
//    })


  } catch {

  }
};

run().catch((err) => console.error(err));

// Listen
app.listen(port, () => {
  console.log(`Book Keeper server is running on port: ${port}`);
});
