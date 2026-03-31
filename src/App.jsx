import { Toaster } from "@/components/ui/toaster";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import AffiliationMerger from "./pages/AffiliationMerger";

function NotFound() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
      <span className="text-4xl font-bold">404</span>
      <span>Page introuvable</span>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AffiliationMerger />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </Router>
  );
}

export default App;