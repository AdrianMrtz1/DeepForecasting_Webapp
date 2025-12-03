import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Notes } from "./pages/Notes";

import ForecastDashboard from "./ForecastDashboard";
import { fluidEase } from "./components/PageWrapper";

const RoutedViews = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.6, ease: fluidEase }}
      >
        <Routes location={location}>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="/notes" element={<Notes />} />
          </Route>
          <Route path="/forecast" element={<ForecastDashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
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
