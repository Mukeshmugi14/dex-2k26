import { BrowserRouter, Route, Routes } from "react-router-dom";
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import Home from "./pages/Home";
import RegisterPage from "./pages/RegisterPage";
import PaymentPage from "./pages/PaymentPage";
import ThankYouPage from "./pages/ThankYouPage";
import ThankYou from "./pages/ThankYou";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminPaymentSettings from "./pages/AdminPaymentSettings";
import PaymentHistory from "./pages/PaymentHistory";
import AdminTeams from "./pages/AdminTeams";
import "./styles/dexathon.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/payment" element={<PaymentPage />} />
        <Route path="/thank-you/:id" element={<ThankYouPage />} />
        <Route path="/thank-you" element={<ThankYou />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route element={<AdminProtectedRoute />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/payment-history" element={<PaymentHistory />} />
          <Route path="/admin/teams" element={<AdminTeams />} />
          <Route path="/admin/payment-settings" element={<AdminPaymentSettings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
