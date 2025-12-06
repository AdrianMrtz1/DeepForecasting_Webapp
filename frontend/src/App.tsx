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
    // mode="wait" ensures the exit animation (curtain covering) finishes
    // before the new component mounts (curtain revealing).
    <AnimatePresence mode="wait">
      <motion.div key={location.pathname} className="relative">
        <motion.div
          // Entrance: Fade in slightly delayed so it appears behind the lifting curtain
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: fluidEase, delay: 0.3 }}

          // Exit: DO NOT fade out. Stay visible (opacity 1) while the Exit Curtain covers the screen.
          // The duration (0.8s) matches the curtain transition time.
          exit={{ opacity: 1, transition: { duration: 0.8 } }}
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
