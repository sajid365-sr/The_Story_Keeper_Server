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


// Custom middleware to verify jwt
const verifyJWT = (req, res, next) =>{
  const authHeader = req.headers.authorization; // Get headers.authorization from req.header to get token inside
  if(!authHeader){
    return res.status(401).send( {message:'Unauthorized Access'}); // if no authHeader found then return with a Unauthorized status
  }
  const token = authHeader.split(' ')[1]; // split header to get token, because token is with 'bearer token'

  jwt.verify(token, process.env.JWT, function(err, decode){ // verify jwt
    if(err){ // if gets error during verify then return with a forbidden status
      return res.status(403).send( {message: 'Forbidden Access'});
    }
    req.decoded = decode; // if pass the verification then set decoded msg inside req
    next(); // call the next function otherwise it won't pass the next function
  })
}



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
  const AdvertiseItemsCollection = client.db("TheStoryKeeper").collection("AdvertiseItems");

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

    // Get all books (shop route)
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
      

      res.send(filteredBooks);
    });

    // Get specific book details by book id
    app.get("/book/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await BooksCollection.findOne(query);

      res.send(result);
    });

    // Order a book (Buyer booking modal route)
    app.post("/orders", async (req, res) => {
      const orderData = req.body.order;
      const filter = {_id:ObjectId(orderData.productId)};
      const filter2 = {_id: orderData.productId};
      const options = {upsert:true};
      const updateDoc = {
          $set:{
              status:'pending'
          }
      }
       await BooksCollection.updateOne(filter, updateDoc, options);
        

      const findAd =  await AdvertiseItemsCollection.findOne(filter2);
      if(findAd){
        const updateDoc = {
          $unset:{
            advertise:1
          }
        }
        await BooksCollection.updateOne(filter, updateDoc);
        await AdvertiseItemsCollection.deleteOne(filter2);
      }     

      const result = await OrderCollection.insertOne(orderData);

      res.send(result);
    });




    //  Store User data
    app.post("/users", async (req, res) => {
      const user = req.body.newUser;
      const result = await UsersCollection.insertOne(user);

      res.send(result);
    });

    // verify user (Admin/Seller/Buyer)
    app.get("/users/type", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email
      if(email !== decodedEmail){
          return res.status(403).send({message: 'Forbidden Access'});
      }

      const query = { email: email };
      const result = await UsersCollection.findOne(query);
      const userType = result.type;

      res.send({ userType });
    });

    // Get buyer orders (buyer my orders route)
    app.get("/myOrders", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;

      if(email !== decodedEmail){
        return res.status(403).send({message: 'Forbidden Access'});
    }
      const query = { email: email };
      const result = await OrderCollection.find(query).toArray();

      
      res.send(result);
    });

    // Get all categories name
    app.get('/categories', async(req, res) =>{
      const allBook = await BooksCollection.find({}).toArray();

      const categoryName = allBook.map(book => book.category);
      const categories = [];
      
      categoryName.forEach((catName) => {
        if (!categories.includes(catName)) {
          categories.push(catName);
        }
        
      });

      res.send(categories);
    })
   


    // Add a new product(book) => seller route
    app.post("/books", async (req, res) => {
        const allBook = await BooksCollection.find({}).toArray();
        const book = req.body.book;
        const filter = { email:book.email };
        
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

        const findSellerStatus = await UsersCollection.findOne(filter);
        book.verified = findSellerStatus.verified;

        

      const result = await BooksCollection.insertOne(book);
      res.send(result);

    });

// Get seller all products (seller myProducts route)
app.get("/myProducts", verifyJWT, async (req, res) => {
    const email = req.query.email;
    const decodedEmail = req.decoded.email
      if(email !== decodedEmail){
          return res.status(403).send({message: 'Forbidden Access'});
      }
    const query = { email: email };
    const result = await BooksCollection.find(query).toArray();


    res.send(result);
  });


  // Delete my product (seller my product route)
app.delete('/myProduct/delete/:id', verifyJWT, async(req,res) =>{
    const id = req.params.id;
    const query = { _id:ObjectId(id) };
    const filter = {_id: id};
    const result = await BooksCollection.deleteOne(query);
    
    const findAd =  await AdvertiseItemsCollection.findOne(filter);
    if(findAd){
      await AdvertiseItemsCollection.deleteOne(filter);
    }   
    
    res.send(result);
})

// Add a new item to Advertise
app.post('/advertise', async(req,res) =>{
    const item = req.body.product;
    item.advertise = true;
    
    const filter = {_id:ObjectId(item._id)};
      const options = {upsert:true};
      const updateDoc = {
          $set:{
              advertise:true
          }
      }
       await BooksCollection.updateOne(filter, updateDoc, options);

    const result = await AdvertiseItemsCollection.insertOne(item);

    res.send(result);
})

// Get advertise items
app.get('/advertise', verifyJWT, async(req,res) =>{
    const query = {};
    const result = await AdvertiseItemsCollection.find(query).toArray();

    
    res.send(result);
})

// Get all seller (Admin all seller route)
app.get('/allSeller', verifyJWT, async(req, res) =>{
  const query = { type:"seller" };
  const result = await UsersCollection.find(query).toArray();

  res.send(result);
})

// Delete seller (Admin all seller route)
app.get('/delete/seller', async(req, res) =>{
  const email = req.query.email;
  const query = {email:email};
  
  const findBook = await BooksCollection.find(query).toArray(); // Check if the seller has any books on books collection
  const orders = await OrderCollection.find({}).toArray();

  const matchBook = findBook.map( book => book._id);
  console.log(matchBook)

  
 
})


// Get all buyer (Admin all buyer route)
app.get('/allBuyer', verifyJWT, async(req, res) =>{
  const query = { type:"buyer" };
  const result = await UsersCollection.find(query).toArray();

  res.send(result);
})

// Delete buyer (Admin all buyer route)
app.get('/delete/buyer',verifyJWT, async(req,res)=>{
  const email = req.query.email;
  const query = {email:email};

  const findBuyerOrder = await OrderCollection.find(query).toArray(); // Check if the buyer has any orders

  if(findBuyerOrder){

    findBuyerOrder.forEach(orders =>{
      if(orders.status === 'pending'){ // If orders, then check if they are pending or paid, if pending then before delete, change their status from pending to available from book collection ;

        const filter = {_id:ObjectId(orders.productId)}; // check orders
        const options = { upsert:true };
        const updateDoc = {
          $set:{
            status:'available'
          }
        }
         BooksCollection.updateOne(filter, updateDoc, options); // updating deleted items status from pending to available inside book collection.
      }

      

    })

    await OrderCollection.deleteMany(query); // Delete buyers unpaid/pending orders
  }
  const result = await UsersCollection.deleteOne(query); // Finally delete buyer from users collections.

  res.send(result);

})

// Verify seller (Admin all seller route)
app.get('/seller/verify',verifyJWT, async(req, res) =>{
  const email = req.query.email;
  const filter = { email:email };
  const options = { upsert:true };
  const updateDoc = {
    $set:{
      verified: true
    }
  }
  const result = await UsersCollection.updateOne(filter, updateDoc, options);

  res.send(result);
})



  } catch {

  }
};

run().catch((err) => console.error(err));

// Listen
app.listen(port, () => {
  console.log(`Book Keeper server is running on port: ${port}`);
});
