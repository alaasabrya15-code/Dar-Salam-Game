import { createRoot } from "react-dom/client";
import { DarSalam } from "@/components/dar-salam";
import "../src/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing native app root element");

createRoot(root).render(<DarSalam />);
