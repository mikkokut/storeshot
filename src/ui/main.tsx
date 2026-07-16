import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "./App"
import { MockupCatalogProvider } from "./MockupCatalogContext"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MockupCatalogProvider>
      <App />
    </MockupCatalogProvider>
  </StrictMode>,
)
