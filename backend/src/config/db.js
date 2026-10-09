import mongoose from "mongoose";

let isConnected = false;

export const connectDB = async () => {
  if (isConnected || mongoose.connection.readyState === 1) {
    isConnected = true;
    return;
  }

  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.mongo_uri ||
    process.env.mongodb_uri;

  if (!uri) {
    console.warn("MongoDB connection warning: Neither MONGO_URI nor mongo_uri environment variable is set.");
    return;
  }

  try {
    const db = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = db.connections[0].readyState === 1;
    console.log("MongoDB connected successfully.");
  } catch (error) {
    console.error("MongoDB connection failure:", error.message);
  }
};
