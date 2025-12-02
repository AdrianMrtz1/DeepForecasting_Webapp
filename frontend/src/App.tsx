import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Notes } from "./pages/Notes";

import ForecastDashboard from "./ForecastDashboard";

const RoutedViews = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/notes" element={<Notes />} />
        </Route>
        <Route path="/forecast" element={<ForecastDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
};

function App() {
  return (
    <BrowserRouter>
      <RoutedViews />
    </BrowserRouter>
  );
}

export default App;
