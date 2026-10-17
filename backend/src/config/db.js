import mongoose from "mongoose";

let isConnected = false;

// Brief network drops to Atlas ("connection … closed") are normal; the driver reconnects on its own. Log them
// instead of letting an unhandled 'error' event stop the whole server.
mongoose.connection.on("error", (error) => console.error(`MongoDB connection error (will retry): ${error.message}`));
mongoose.connection.on("disconnected", () => { isConnected = false; console.warn("MongoDB disconnected; reconnecting on the next request."); });
mongoose.connection.on("reconnected", () => console.log("MongoDB reconnected."));

export const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }

  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.mongo_uri ||
    process.env.mongodb_uri;

  if (!uri) {
    throw Object.assign(
      new Error("MONGO_URI environment variable is missing on Vercel. Please add MONGO_URI in Vercel → Settings → Environment Variables."),
      { status: 500 }
    );
  }

  try {
    const db = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 7000,
    });
    isConnected = db.connections[0].readyState === 1;
  } catch (error) {
    isConnected = false;
    throw Object.assign(
      new Error(`Database connection failed (${error.message}). Please ensure 0.0.0.0/0 is added to Network Access in MongoDB Atlas.`),
      { status: 500 }
    );
  }
};
