const express = require("express");
const axios = require("axios");
const app = express();

const PORT = 3000;
const SERVERS = [
  "http://myservicego.info:8080",
  "http://livemegax.xyz:8080"
];

// Función failover
async function fetchFromServers(path, params) {
  for (const base of SERVERS) {
    try {
      const resp = await axios.get(`${base}${path}`, { params, timeout: 5000 });
      if (resp.data && !(Array.isArray(resp.data) && resp.data.length === 0)) {
        return resp.data;
      }
    } catch (err) {
      console.log(`❌ Falló servidor ${base}: ${err.message}`);
    }
  }
  throw new Error("Ningún servidor respondió correctamente");
}

app.get("/api", async (req, res) => {
  try {
    const { action, username, password } = req.query;

    if (action === "get_live_categories") {
      const categories = await fetchFromServers("/player_api.php", { action, username, password });

      // Generar todas las promesas de streams al mismo tiempo
      const promises = categories.map(async cat => {
        try {
          const streams = await fetchFromServers("/player_api.php", {
            action: "get_live_streams",
            username,
            password,
            category_id: cat.category_id,
          });
          return (Array.isArray(streams) && streams.length > 0) ? cat : null;
        } catch {
          return null;
        }
      });

      // Esperamos todas las promesas
      let filtered = (await Promise.all(promises)).filter(cat => cat !== null);

      // Priorizar "ecuador" al inicio
      filtered.sort((a, b) => {
        const aMatch = a.category_name.toLowerCase().includes("ecuador");
        const bMatch = b.category_name.toLowerCase().includes("ecuador");
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });

      return res.json(filtered);
    }

    // Otras acciones
    const data = await fetchFromServers("/player_api.php", req.query);
    return res.json(data);

  } catch (error) {
    console.error("Error en proxy:", error.message);
    res.status(500).json({ error: "Error en el proxy" });
  }
});

app.listen(PORT, () => console.log(`🚀 Proxy corriendo en http://localhost:${PORT}`));
