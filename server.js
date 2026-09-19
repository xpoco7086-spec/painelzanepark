const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, ".")));

let calls = [];

app.get("/api/calls", (req, res) => {
  res.json({ calls });
});

app.post("/api/calls", (req, res) => {
  const { model, plate, operator } = req.body;

  const call = {
    id: Date.now(),
    model: model || "",
    plate: plate || "",
    operator: operator || "",
    createdAt: new Date().toISOString()
  };

  calls.unshift(call);

  // Mantém somente as 50 chamadas mais recentes
  calls = calls.slice(0, 50);

  res.json({
    success: true,
    call
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ZANE PARK rodando na porta ${PORT}`);
});
