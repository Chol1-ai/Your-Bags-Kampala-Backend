const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const app = express();

app.use(express.json());
app.use(express.static("public"));

// JSON File Fallback for Products
const PRODUCTS_FILE = path.join(__dirname, "public", "products.json");
let useMongoDB = false;

// Load products from JSON file
function loadProductsFromFile() {
  try {
    if (fs.existsSync(PRODUCTS_FILE)) {
      const data = fs.readFileSync(PRODUCTS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error loading products from file:", err);
  }
  return [];
}

// Save products to JSON file
function saveProductsToFile(products) {
  try {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
    return true;
  } catch (err) {
    console.error("Error saving products to file:", err);
    return false;
  }
}

// 1. DATABASE CONNECTION
const MONGO_URI = process.env.MONGO_URI;

// 2. PRODUCT MODEL (only if MongoDB is available)
let Product;
if (MONGO_URI) {
  try {
    const productSchema = new mongoose.Schema({
      name: String,
      price: Number,
      category: String,
      image: String,
      reviews: [{ user: String, rating: Number, comment: String }],
    });
    Product = mongoose.model("Product", productSchema);
  } catch (err) {
    console.log("MongoDB model error:", err.message);
  }
}

// 3. IMAGE UPLOAD CONFIG
const imageDir = path.join(__dirname, "public", "images");
if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: imageDir,
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error("Only JPG, PNG, and WEBP images are allowed."));
    }
    cb(null, true);
  },
});

// --- ROUTES ---

app.get("/api/products", async (req, res) => {
  try {
    if (Product) {
      const products = await Product.find({});
      return res.json(products);
    }
    // Fallback to JSON file
    const products = loadProductsFromFile();
    res.json(products);
  } catch (error) {
    // Fallback to JSON file on error
    const products = loadProductsFromFile();
    res.json(products);
  }
});

app.post("/api/products", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Image file is required." });
    }

    const name = String(req.body.name || "").trim();
    const category = String(req.body.category || "").trim();
    const price = Number(req.body.price);
    if (!name || !category) {
      return res
        .status(400)
        .json({ message: "Name and category are required." });
    }

    if (Number.isNaN(price)) {
      return res.status(400).json({ message: "Price must be a valid number." });
    }

    const newBag = {
      _id: Date.now().toString(),
      name,
      price,
      category,
      image: req.file.filename,
      reviews: [],
    };

    // Try MongoDB first, fallback to JSON file
    if (Product) {
      try {
        const mongoBag = new Product(newBag);
        await mongoBag.save();
        return res.status(201).json(mongoBag);
      } catch (mongoErr) {
        console.log(
          "MongoDB save failed, using JSON fallback:",
          mongoErr.message,
        );
      }
    }

    // JSON file fallback
    const products = loadProductsFromFile();
    products.push(newBag);
    if (saveProductsToFile(products)) {
      return res.status(201).json(newBag);
    }

    res.status(500).json({ message: "Failed to save product." });
  } catch (error) {
    res.status(500).json({ message: "Failed to create product." });
  }
});

app.post("/api/products/:id/review", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid product id." });
    }

    const bag = await Product.findById(req.params.id);
    if (!bag) {
      return res.status(404).json({ message: "Product not found." });
    }

    const { user, rating, comment } = req.body;
    const normalizedRating = Number(rating);

    if (
      !user ||
      Number.isNaN(normalizedRating) ||
      normalizedRating < 1 ||
      normalizedRating > 5
    ) {
      return res
        .status(400)
        .json({ message: "Valid user and rating are required." });
    }

    bag.reviews.push({ user, rating: normalizedRating, comment });
    await bag.save();
    res.status(200).send();
  } catch (error) {
    res.status(500).json({ message: "Failed to add review." });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  const { id } = req.params;

  // Try MongoDB first
  if (Product) {
    try {
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid product id." });
      }
      const deleted = await Product.findByIdAndDelete(id);
      if (deleted) {
        return res.status(200).send();
      }
    } catch (mongoErr) {
      console.log("MongoDB delete failed:", mongoErr.message);
    }
  }

  // JSON file fallback
  try {
    const products = loadProductsFromFile();
    const index = products.findIndex((p) => p._id === id);
    if (index !== -1) {
      products.splice(index, 1);
      saveProductsToFile(products);
      return res.status(200).send();
    }
    return res.status(404).json({ message: "Product not found." });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete product." });
  }
});

// PUT - Update a product
app.put("/api/products/:id", async (req, res) => {
  const { id } = req.params;
  const { name, price, category, image } = req.body;

  const updateData = {};
  if (name) updateData.name = name.trim();
  if (price) updateData.price = Number(price);
  if (category) updateData.category = category.trim();
  if (image) updateData.image = image;

  // Try MongoDB first
  if (Product) {
    try {
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid product id." });
      }
      const updated = await Product.findByIdAndUpdate(id, updateData, {
        new: true,
      });
      if (updated) {
        return res.json(updated);
      }
    } catch (mongoErr) {
      console.log("MongoDB update failed:", mongoErr.message);
    }
  }

  // JSON file fallback
  try {
    const products = loadProductsFromFile();
    const index = products.findIndex((p) => p._id === id);
    if (index === -1) {
      return res.status(404).json({ message: "Product not found." });
    }
    products[index] = { ...products[index], ...updateData };
    saveProductsToFile(products);
    return res.json(products[index]);
  } catch (error) {
    return res.status(500).json({ message: "Failed to update product." });
  }
});

// POST - Upload image only (for edits)
app.post("/api/upload-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Image file is required." });
    }

    res.json({
      filename: req.file.filename,
      url: `/images/${req.file.filename}`,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to upload image." });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ message: error.message });
  }

  if (error) {
    return res.status(400).json({ message: error.message || "Bad request." });
  }

  next();
});

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  // Try MongoDB connection
  if (MONGO_URI) {
    try {
      await mongoose.connect(MONGO_URI);
      console.log("MongoDB Connected");
    } catch (error) {
      console.log(
        "MongoDB not available, using JSON file storage:",
        error.message,
      );
    }
  } else {
    console.log("No MONGO_URI found, using JSON file storage");
  }

  // Always start the server (works with JSON fallback)
  app.listen(PORT, () => console.log(`Server Live: http://localhost:${PORT}`));
}

startServer();
