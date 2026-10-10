import mongoose from "mongoose";

let cachedPromise = null;

export const connectDB = async () => {
  // If already connected, return existing connection
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // If already connecting, return the in-flight promise to prevent concurrent connect calls
  if (cachedPromise) {
    return cachedPromise;
  }

  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.DATABASE_URL ||
    process.env.mongo_uri ||
    process.env.mongodb_uri;

  if (!uri) {
    const error = new Error(
      "MONGO_URI environment variable is missing on Vercel. Please add MONGO_URI in Vercel → Project Settings → Environment Variables."
    );
    error.status = 500;
    error.isConfigError = true;
    throw error;
  }

  cachedPromise = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      bufferCommands: false,
    })
    .then((m) => {
      return m.connection;
    })
    .catch((err) => {
      cachedPromise = null;
      const error = new Error(
        `Database connection failed: ${err.message}. If deploying on Vercel, ensure 0.0.0.0/0 is added to IP Access List in MongoDB Atlas → Network Access.`
      );
      error.status = 500;
      error.isConfigError = true;
      throw error;
    });

  return cachedPromise;
};
