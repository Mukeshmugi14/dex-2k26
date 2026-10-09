import app from "./app.js";
import { connectDB } from "./config/db.js";
import { seedAdmin } from "./utils/seedAdmin.js";
import { logEmailConfiguration, verifyEmailTransport } from "./services/emailService.js";

if (!process.env.VERCEL) {
  connectDB()
    .then(async () => {
      await seedAdmin();
      logEmailConfiguration();
      verifyEmailTransport();
      const port = process.env.PORT || 5000;
      app.listen(port, "0.0.0.0", () => {
        console.log(`DEXATHON API running on port ${port}`);
      });
    })
    .catch((error) => {
      console.error(`Database connection failed: ${error.message}`);
      process.exit(1);
    });
}

export default app;
