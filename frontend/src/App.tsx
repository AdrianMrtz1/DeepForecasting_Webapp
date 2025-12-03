import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

import { Layout } from "./components/Layout";
import { TransitionCurtain } from "./components/TransitionCurtain";
import { Home } from "./pages/Home";
import { Notes } from "./pages/Notes";

import ForecastDashboard from "./ForecastDashboard";
import { fluidEase } from "./components/PageWrapper";

const RoutedViews = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div key={location.pathname} className="relative">
        <TransitionCurtain />
        <motion.div
          initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -16, filter: "blur(6px)" }}
          transition={{ duration: 0.7, ease: fluidEase, delay: 0.35 }}
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
