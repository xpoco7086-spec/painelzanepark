
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, ".")));

// =====================================
// OPERADORES ZANE PARK
// =====================================

const operators = {
  "Bali": "1234",
  "Pergoletta": "1234",
  "Pérgoletta": "1234",
  "Cão Veio": "1234",
  "Estacionamento": "1234",
  "Estatura": "1234"
};

// =====================================
// FILA GERAL DE CHAMADAS
// =====================================

let calls = [];
let nextId = 1;

function addCall(model, plate, operator, origin) {
  const call = {
    id: nextId++,
    model: String(model || "Veículo"),
    plate: String(plate || ""),
    operator: String(operator || ""),
    origin: String(origin || operator || ""),
    createdAt: new Date().toISOString()
  };

  calls.push(call);

  if (calls.length > 2000) {
    calls = calls.slice(-2000);
  }

  console.log(
    "CHAMADA:",
    call.model,
    call.plate,
    call.origin
  );

  return call;
}

// =====================================
// LOGIN DO OPERADOR
// =====================================

app.post("/api/login", (req, res) => {
  const { operator, password } = req.body || {};

  if (
    operators[operator] &&
    operators[operator] === password
  ) {
    return res.json({
      ok: true,
      operator
    });
  }

  res.status(401).json({
    ok: false,
    message: "Usuário ou senha inválidos."
  });
});

// =====================================
// CONSULTAR CHAMADAS DO PAINEL
// =====================================

app.get("/api/calls", (req, res) => {
  const operator = String(
    req.query.operator || ""
  ).trim();

  const data = operator
    ? calls.filter(c => c.operator === operator)
    : calls;

  res.json({
    ok: true,
    calls: data.slice(-8).reverse()
  });
});

// =====================================
// CHAMADA MANUAL DO OPERADOR
// =====================================

app.post("/api/calls", (req, res) => {
  const operator = String(
    req.body?.operator || ""
  ).trim();

  const model = String(
    req.body?.model || ""
  ).trim();

  const plate = String(
    req.body?.plate || ""
  ).trim();

  if (!operators[operator]) {
    return res.status(401).json({
      ok: false,
      message: "Operador inválido."
    });
  }

  if (!model) {
    return res.status(400).json({
      ok: false,
      message: "Informe o modelo do veículo."
    });
  }

  const call = addCall(
    model,
    plate,
    operator,
    operator
  );

  res.json({
    ok: true,
    call
  });
});

// =====================================
// CENTRAL DE RÁDIO
// =====================================

app.get("/api/radio/calls", (req, res) => {
  const key = process.env.RADIO_KEY;

  if (!key) {
    return res.status(503).json({
      ok: false,
      message: "Configure RADIO_KEY no servidor."
    });
  }

  if (req.get("x-radio-key") !== key) {
    return res.status(401).json({
      ok: false,
      message: "Chave inválida."
    });
  }

  const after = Math.max(
    0,
    Number.parseInt(
      req.query.after || "0",
      10
    ) || 0
  );

  res.set("Cache-Control", "no-store");

  res.json({
    ok: true,
    calls: calls
      .filter(c => c.id > after)
      .slice(0, 100),
    latestId: nextId - 1
  });
});

// =====================================
// INTEGRAÇÃO JUMP PARK
// BALI + LA PERGOLETTA
// =====================================

const JUMP_INTERVAL = 15000;

const establishments = [
  {
    name: "Bali",
    id: process.env.JUMP_ESTABLISHMENT_ID
  },
  {
    name: "La Pergoletta",
    id:
      process.env.JUMP_PERGOLETTA_ESTABLISHMENT_ID ||
      "30153"
  }
];

let jumpVehicles = [];
let jumpLastUpdate = null;
let jumpLastError = null;
let jumpChecking = false;

const jumpStates = new Map();

for (const establishment of establishments) {
  jumpStates.set(establishment.name, {
    initialized: false,
    previousIds: new Set(),
    vehicles: [],
    lastUpdate: null,
    lastError: null
  });
}

// =====================================
// IDENTIFICAR VEÍCULO JUMP
// =====================================

function jumpVehicleId(carro) {
  const id =
    carro.serviceOrderId ??
    carro.serviceOrderCode;

  if (id !== undefined && id !== null && id !== "") {
    return String(id);
  }

  const plate = String(
    carro.plate || ""
  ).trim();

  const entry = String(
    carro.entryDateTime || ""
  );

  if (!plate && !entry) {
    return null;
  }

  return plate + "|" + entry;
}

// =====================================
// CONSULTAR API JUMP PARK
// =====================================

async function fetchJumpVehicles(establishment) {
  const integrationId =
    process.env.JUMP_INTEGRATION_ID;

  const establishmentId = establishment.id;

  const token =
    process.env.JUMP_ACCESS_TOKEN;

  if (!integrationId || !establishmentId || !token) {
    throw new Error(
      "Credenciais Jump Park não configuradas"
    );
  }

  const hoje = new Date()
    .toISOString()
    .slice(0, 10);

  const inicio = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString().slice(0, 10);

  const url =
    "https://new-web.jumpparkapi.com.br/api/" +
    encodeURIComponent(integrationId) +
    "/public/establishment/" +
    encodeURIComponent(establishmentId) +
    "/serviceorders/export/json" +
    "?startDate=" + inicio +
    "&endDate=" + hoje +
    "&operationSituation=2";

  const resposta = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!resposta.ok) {
    throw new Error(
      establishment.name +
      ": Jump Park HTTP " +
      resposta.status
    );
  }

  const dados = await resposta.json();

  if (!Array.isArray(dados?.data?.content)) {
    throw new Error(
      establishment.name +
      ": formato inesperado da API"
    );
  }

  return dados.data.content.map(carro => ({
    serviceOrderId: carro.serviceOrderId,
    serviceOrderCode: carro.serviceOrderCode,
    placa: carro.plate || "",
    modelo: carro.vehicleModel || "",
    cor: carro.vehicleColor || "",
    cliente: carro.clientName || "",
    entrada: carro.entryDateTime || "",
    saida: carro.exitDateTime || "",
    situacao: carro.operationSituationName || "",
    origem: establishment.name,
    estabelecimento: establishment.name,
    _id: jumpVehicleId(carro)
  }));
}

// =====================================
// SINCRONIZAR CADA ESTABELECIMENTO
// =====================================

async function syncEstablishment(establishment) {
  const state = jumpStates.get(establishment.name);

  try {
    const vehicles =
      await fetchJumpVehicles(establishment);

    const currentIds = new Set(
      vehicles
        .map(v => v._id)
        .filter(Boolean)
    );

    // Primeira consulta não anuncia
    // veículos que já estavam fora.
    if (!state.initialized) {
      state.previousIds = currentIds;
      state.initialized = true;

      console.log(
        "JUMP INICIALIZADO:",
        establishment.name,
        vehicles.length,
        "veículos fora"
      );
    } else {
      const novos = vehicles.filter(v =>
        v._id &&
        !state.previousIds.has(v._id)
      );

      for (const v of novos) {
        addCall(
          v.modelo || "Veículo",
          v.placa || "",
          "Jump Park",
          establishment.name
        );

        console.log(
          "JUMP ENVIADO PARA RÁDIO:",
          establishment.name,
          v.modelo,
          v.placa
        );
      }

      state.previousIds = currentIds;
    }

    state.vehicles = vehicles;
    state.lastUpdate = new Date().toISOString();
    state.lastError = null;

  } catch (erro) {
    state.lastError = erro.message;

    console.error(
      "ERRO JUMP PARK:",
      establishment.name,
      erro.message
    );
  }
}

// =====================================
// SINCRONIZAÇÃO GERAL
// =====================================

async function syncJump() {
  if (jumpChecking) return;

  jumpChecking = true;

  try {
    await Promise.all(
      establishments.map(establishment =>
        syncEstablishment(establishment)
      )
    );

    jumpVehicles = establishments.flatMap(
      establishment => {
        const state =
          jumpStates.get(establishment.name);

        return state.vehicles;
      }
    );

    const errors = establishments
      .map(establishment =>
        jumpStates.get(establishment.name).lastError
      )
      .filter(Boolean);

    jumpLastError =
      errors.length ? errors.join(" | ") : null;

    jumpLastUpdate = new Date().toISOString();

  } finally {
    jumpChecking = false;
  }
}

// =====================================
// VEÍCULOS FORA — PAINEL
// =====================================

app.get("/api/jump/veiculos-fora", async (req, res) => {
  const initialized = establishments.some(
    establishment =>
      jumpStates.get(establishment.name).initialized
  );

  if (!initialized && !jumpChecking) {
    await syncJump();
  }

  const ready = establishments.some(
    establishment =>
      jumpStates.get(establishment.name).initialized
  );

  if (!ready && jumpLastError) {
    return res.status(503).json({
      ok: false,
      message: jumpLastError
    });
  }

  res.set("Cache-Control", "no-store");

  res.json({
    ok: true,
    total: jumpVehicles.length,
    veiculos: jumpVehicles.map(v => ({
      serviceOrderId: v.serviceOrderId,
      serviceOrderCode: v.serviceOrderCode,
      placa: v.placa,
      modelo: v.modelo,
      cor: v.cor,
      cliente: v.cliente,
      entrada: v.entrada,
      saida: v.saida,
      situacao: v.situacao,
      origem: v.origem,
      estabelecimento: v.estabelecimento
    })),
    atualizadoEm: jumpLastUpdate,
    aviso: jumpLastError
  });
});

// =====================================
// DEBUG JUMP PARK
// =====================================

app.get("/api/jump/debug", (req, res) => {
  res.json({
    integrationId:
      !!process.env.JUMP_INTEGRATION_ID,
    establishmentId:
      !!process.env.JUMP_ESTABLISHMENT_ID,
    pergolettaId:
      establishments[1].id,
    accessToken:
      !!process.env.JUMP_ACCESS_TOKEN,
    inicializado:
      establishments.some(e =>
        jumpStates.get(e.name).initialized
      ),
    ultimaAtualizacao: jumpLastUpdate,
    ultimoErro: jumpLastError,
    totalVeiculosFora: jumpVehicles.length,
    estabelecimentos: establishments.map(e => {
      const state = jumpStates.get(e.name);

      return {
        nome: e.name,
        inicializado: state.initialized,
        total: state.vehicles.length,
        atualizadoEm: state.lastUpdate,
        erro: state.lastError
      };
    })
  });
});

// =====================================
// INICIAR SERVIDOR
// =====================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    "ZANE PARK funcionando na porta " + PORT
  );

  syncJump();

  setInterval(() => {
    syncJump();
  }, JUMP_INTERVAL);
});
