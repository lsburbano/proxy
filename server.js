const express = require("express");
const axios = require("axios");
const app = express();

// Configuración
const PORT = process.env.PORT || 3000; // Railway asigna el puerto vía env
const SERVERS = [
  "http://myservicego.info:8080",
  "http://livemegax.xyz:8080"
];

// Función para pedir a los servidores en orden (failover)
async function fetchFromServers(path, params) {
  for (const base of SERVERS) {
    try {
      const resp = await axios.get(`${base}${path}`, { params, timeout: 5000 });
      if (resp.data && !(Array.isArray(resp.data) && resp.data.length === 0)) {
        console.log(`✅ Usando servidor: ${base}`);
        return resp.data;
      }
    } catch (err) {
      console.log(`❌ Falló servidor ${base}: ${err.message}`);
    }
  }
  throw new Error("Ningún servidor respondió correctamente");
}

// Proxy principal
app.get("/api", async (req, res) => {
  try {
    const { action, username, password } = req.query;

    // Solo interceptamos get_live_categories
    if (action === "get_live_categories") {
      // 1️⃣ Obtener categorías originales con failover
      let categories = await fetchFromServers("/player_api.php", {
        action,
        username,
        password,
      });

      // 2️⃣ Filtrar categorías que no tengan streams en paralelo
      const filteredPromises = categories.map(async (cat) => {
        try {
          const streams = await fetchFromServers("/player_api.php", {
            action: "get_live_streams",
            username,
            password,
            category_id: cat.category_id,
          });

          if (Array.isArray(streams) && streams.length > 0) return cat;
        } catch (err) {
          console.log(`⚠️ Error al obtener streams de ${cat.category_id}: ${err.message}`);
        }
        return null;
      });

      let filtered = (await Promise.all(filteredPromises)).filter(Boolean);

      // 3️⃣ Priorizar categorías que contienen "Ecuador"
      filtered.sort((a, b) => {
        const aE = a.category_name.toLowerCase().includes("ecuador") ? -1 : 0;
        const bE = b.category_name.toLowerCase().includes("ecuador") ? -1 : 0;
        return aE - bE;
      });

      return res.json(filtered);
    }

    // Otras acciones → proxy directo con failover
    const data = await fetchFromServers("/player_api.php", req.query);
    return res.json(data);

  } catch (error) {
    console.error("Error en proxy:", error.message);
    res.status(500).json({ error: "Error en el proxy" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Proxy API corriendo en http://localhost:${PORT}`);
});
