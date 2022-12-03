const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000;
require('dotenv').config();

// Middleware
app.use(cors());
app.use(express.json());

// Default route
app.get('/', (req, res) => {
    res.send('Book Keeper server is running')
})

// Listen
app.listen(port, () =>{
    console.log(`Book Keeper server is running on port: ${port}`);
})

