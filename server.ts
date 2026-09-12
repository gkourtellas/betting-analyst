import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { runDailyAnalysisPureTS, SportSelection } from "./src/analystEngine";
import dotenv from "dotenv";

dotenv.config();

const BASE_PATH = "/football";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route to execute the analysis live
  app.post(`${BASE_PATH}/api/run-analysis`, async (req, res) => {
    console.log("Starting live analysis execution in TypeScript...");
    try {
      const timeWindowHours = Number(req.body?.timeWindowHours);
      const rawSport = req.body?.sport;
      const sport: SportSelection = ["football", "basketball", "all"].includes(rawSport) ? rawSport : "football";
      const result = await runDailyAnalysisPureTS(true, Number.isFinite(timeWindowHours) ? timeWindowHours : undefined, sport);
      return res.json(result);
    } catch (err: any) {
      console.error("Error running daily analysis engine:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Failed to execute daily analysis engine.",
        logs: err.stack || String(err)
      });
    }
  });

  // Serve static files / Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(BASE_PATH, express.static(distPath));
    app.get(`${BASE_PATH}/*`, (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}${BASE_PATH}/`);
  });
}

startServer();
