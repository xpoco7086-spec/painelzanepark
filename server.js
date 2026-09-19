const express=require("express"),http=require("http"),{Server}=require("socket.io"),fs=require("fs"),path=require("path");
const app=express(),server=http.createServer(app),io=new Server(server),PORT=process.env.PORT||10000;
const file=path.join(__dirname,"calls.json");
const operators={"Bali":"1234","Pergoletta":"1234","Cão Veio":"1234","Estacionamento":"1234"};
let calls=[];try{calls=JSON.parse(fs.readFileSync(file,"utf8"))}catch{}
let nextId=calls.reduce((m,c)=>Math.max(m,Number(c.id)||0),0)+1;
const save=()=>fs.writeFileSync(file,JSON.stringify(calls.slice(-200),null,2));
app.use(express.json());app.use(express.static(path.join(__dirname,".")));
app.post("/api/login",(q,s)=>{let{operator,password}=q.body||{};if(operators[operator]===password)return s.json({ok:true,operator});s.status(401).json({ok:false,message:"Usuário ou senha inválidos."})});
app.get("/api/calls",(q,s)=>{let operator=String(q.query.operator||"").trim();
let data=operator?calls.filter(c=>c.operator===operator).slice(-8).reverse():calls.slice(-8).reverse();
s.json({ok:true,calls:data});});
app.post("/api/calls",(q,s)=>{let operator=String(q.body?.operator||"").trim(),model=String(q.body?.model||"").trim(),plate=String(q.body?.plate||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
if(!operators[operator])return s.status(401).json({ok:false,message:"Operador inválido."});
if(!model)return s.status(400).json({ok:false,message:"Informe o modelo do veículo."});
if(plate&&plate.length!==2&&plate.length!==7)return s.status(400).json({ok:false,message:"A placa deve ter 3 ou 4 caracteres ou a placa completa."});
let c={id:nextId++,model,plate,operator,origin:operator,createdAt:new Date().toISOString()};calls.push(c);save();io.emit("new-call",c);s.json({ok:true,call:c})});
server.listen(PORT,"0.0.0.0",()=>console.log("Zane Park na porta "+PORT));
