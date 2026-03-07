const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
require("dotenv").config();
const app = express();

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;
const PORT = Number(process.env.PORT) || 3000;
const MONGO_URI = process.env.MONGO_URI;

app.use(
  cors({
    origin: FRONTEND_ORIGIN ? FRONTEND_ORIGIN.split(",").map((s) => s.trim()) : true,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  }),
);
app.use(express.json());

// 1. DATABASE CONNECTION
if (!MONGO_URI) {
  console.error("Missing MONGO_URI. Add it to a .env file (MONGO_URI=...) or set it in your shell.");
  process.exit(1);
}

// 2. PRODUCT MODEL
const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  category: String,
  image: String,
  reviews: [{ user: String, rating: Number, comment: String }],
});
const Product = mongoose.model("Product", productSchema);

// 3. IMAGE UPLOAD CONFIG
const imageDir = path.join(__dirname, "images");
if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir, { recursive: true });
}
app.use("/images", express.static(imageDir));

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
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find({});
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch products." });
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
      return res.status(400).json({ message: "Name and category are required." });
    }

    if (Number.isNaN(price)) {
      return res.status(400).json({ message: "Price must be a valid number." });
    }

    const newBag = new Product({
      name,
      price,
      category,
      image: req.file.filename,
    });

    await newBag.save();
    res.status(201).json(newBag);
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

    if (!user || Number.isNaN(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
      return res.status(400).json({ message: "Valid user and rating are required." });
    }

    bag.reviews.push({ user, rating: normalizedRating, comment });
    await bag.save();
    res.status(200).send();
  } catch (error) {
    res.status(500).json({ message: "Failed to add review." });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid product id." });
    }

    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Product not found." });
    }

    res.status(200).send();
  } catch (error) {
    res.status(500).json({ message: "Failed to delete product." });
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

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB Connected");
    app.listen(PORT, () => console.log(`Server Live: http://localhost:${PORT}`));
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
    process.exit(1);
  }
}

startServer();
