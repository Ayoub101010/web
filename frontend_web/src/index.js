import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "leaflet/dist/leaflet.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";


const globalStyles = `
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
      'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
      sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  
  #root {
    height: 100vh;
    overflow: hidden;
  }
  
  * {
    box-sizing: border-box;
  }
`;

// Injecter les styles dans le head
const style = document.createElement('style');
style.textContent = globalStyles;
document.head.appendChild(style);

const root = ReactDOM.createRoot(document.getElementById("root"));

// ✅ SANS React.StrictMode pour éviter les appels API multiples (6×)
root.render(<App />);