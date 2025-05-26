import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { SolanaProvider } from "./components/SolanaProvider.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <SolanaProvider>
            <App />
        </SolanaProvider>
    </React.StrictMode>
);